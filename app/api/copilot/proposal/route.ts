import { NextResponse } from "next/server";
import {
  ApiInputError,
  errorResponse,
  rateLimit,
  readJsonBody,
  requireString,
} from "@/lib/api-guard";
import { detectCopilotTradeFromDescription } from "@/lib/copilot/trade-detection";
import {
  getCopilotTradePack,
  resolveCopilotTrade,
  type CopilotTradePack,
} from "@/lib/copilot/trade-packs";
import type {
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotUnit,
} from "@/lib/copilot/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ProposalBody = {
  description?: unknown;
  trade?: unknown;
  catalog?: unknown;
  settings?: unknown;
};

type UnknownRecord = Record<string, unknown>;

const COPILOT_UNITS = new Set<CopilotUnit>([
  "m2",
  "m",
  "ml",
  "l",
  "h",
  "jour",
  "unite",
  "forfait",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(",", "."))
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function sanitizeCatalog(value: unknown, pack: CopilotTradePack): CopilotCatalogService[] {
  if (!Array.isArray(value)) return [];
  const defaults = new Map(pack.defaultCatalog.map((service) => [service.code, service]));

  return value.slice(0, 150).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.code !== "string") return [];
    const fallback = defaults.get(entry.code.trim());
    if (!fallback) return [];
    const unit = typeof entry.unit === "string" && COPILOT_UNITS.has(entry.unit as CopilotUnit)
      ? entry.unit as CopilotUnit
      : fallback.unit;
    const taxRate = [0, 5.5, 10, 20].includes(Number(entry.taxRate))
      ? Number(entry.taxRate)
      : fallback.taxRate;

    return [{
      code: fallback.code,
      label: typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim().slice(0, 180)
        : fallback.label,
      description: typeof entry.description === "string"
        ? entry.description.trim().slice(0, 600)
        : fallback.description,
      unit,
      unitPriceHt: boundedNumber(entry.unitPriceHt, 0, 100_000, fallback.unitPriceHt),
      materialCostPerUnit: boundedNumber(entry.materialCostPerUnit, 0, 100_000, fallback.materialCostPerUnit),
      labourHoursPerUnit: boundedNumber(entry.labourHoursPerUnit, 0, 1_000, fallback.labourHoursPerUnit),
      taxRate,
      source: "company_catalog" as const,
    }];
  });
}

function sanitizeSettings(value: unknown, pack: CopilotTradePack): Partial<CopilotCompanySettings> {
  if (!isRecord(value)) return {};
  const defaults = pack.defaultSettings;
  return {
    hourlyCost: boundedNumber(value.hourlyCost, 0, 500, defaults.hourlyCost),
    targetMarginRate: boundedNumber(value.targetMarginRate, 0, 100, defaults.targetMarginRate),
    defaultTaxRate: [0, 5.5, 10, 20].includes(Number(value.defaultTaxRate))
      ? Number(value.defaultTaxRate)
      : defaults.defaultTaxRate,
    includeTravelFee: typeof value.includeTravelFee === "boolean"
      ? value.includeTravelFee
      : defaults.includeTravelFee,
  };
}

async function understandWithDeepSeek(description: string, pack: CopilotTradePack) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      thinking: { type: "disabled" },
      temperature: 0,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: pack.aiSystemPrompt },
        { role: "user", content: description },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? `DeepSeek API : ${response.status}`);
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("DeepSeek n’a retourné aucune donnée.");
  return JSON.parse(content) as unknown;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "copilot-proposal", 20);
  if (limited) return limited;

  try {
    const body = await readJsonBody<ProposalBody>(request, 80_000);
    const description = requireString(body.description, "La description du chantier", 20_000);
    const hasExplicitTrade = typeof body.trade === "string" && body.trade.trim().length > 0;
    const trade = hasExplicitTrade
      ? resolveCopilotTrade(body.trade)
      : detectCopilotTradeFromDescription(description);
    if (!trade) {
      throw new ApiInputError("Ce métier n’est pas encore pris en charge par le copilote.");
    }
    const pack = getCopilotTradePack(trade);
    const localInterpretation = pack.interpretLocal(description);
    let interpretation = localInterpretation;
    let provider = "local-business-parser";
    let warning: string | null = null;

    try {
      const aiFacts = await understandWithDeepSeek(description, pack);
      if (aiFacts) {
        interpretation = pack.normalizeAi(description, aiFacts);
        provider = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
      }
    } catch {
      warning = "La compréhension locale fiable a été utilisée automatiquement.";
    }

    const proposal = pack.buildProposal(interpretation, {
      catalog: sanitizeCatalog(body.catalog, pack),
      settings: sanitizeSettings(body.settings, pack),
    });

    return NextResponse.json({
      provider,
      mode: "ai-understanding-deterministic-business-engine",
      trade: pack.trade,
      trade_pack_version: pack.version,
      proposal,
      ready_to_create_draft: proposal.status === "ready_for_review",
      warning,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse(new ApiInputError("La réponse IA est invalide."), "Préparation impossible.");
    }
    return errorResponse(error, "Préparation du chantier impossible.");
  }
}
