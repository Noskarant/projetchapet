import { DEFAULT_COPILOT_TRADE, getCopilotTradePack, resolveCopilotTrade } from "./trade-packs";
import type { CopilotCatalogService, CopilotCompanySettings, CopilotTrade } from "./types";

export const FORGEO_BUSINESS_PROFILE_STORAGE_KEY = "forgeo:business-profile:v1";
export const LEGACY_TRADE_STORAGE_KEY = "forgeo:primary-trade";

export type ForgeoCompanyRule = {
  id: string;
  trade: CopilotTrade;
  instruction: string;
  active: boolean;
  createdAt: string;
};

export type ForgeoTradeProfile = {
  trade: CopilotTrade;
  packVersion: number;
  settings: Partial<CopilotCompanySettings>;
  catalog: CopilotCatalogService[];
};

export type ForgeoBusinessProfile = {
  version: 1;
  primaryTrade: CopilotTrade;
  enabledTrades: CopilotTrade[];
  trades: Partial<Record<CopilotTrade, ForgeoTradeProfile>>;
  rules: ForgeoCompanyRule[];
  updatedAt: string;
};

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function normalizeSettings(value: unknown): Partial<CopilotCompanySettings> {
  if (!isRecord(value)) return {};
  const next: Partial<CopilotCompanySettings> = {};
  const hourlyCost = cleanNumber(value.hourlyCost, 0, 500);
  const targetMarginRate = cleanNumber(value.targetMarginRate, 0, 100);
  const defaultTaxRate = cleanNumber(value.defaultTaxRate, 0, 20);
  if (hourlyCost !== null) next.hourlyCost = hourlyCost;
  if (targetMarginRate !== null) next.targetMarginRate = targetMarginRate;
  if (defaultTaxRate !== null && [0, 5.5, 10, 20].includes(defaultTaxRate)) next.defaultTaxRate = defaultTaxRate;
  if (typeof value.includeTravelFee === "boolean") next.includeTravelFee = value.includeTravelFee;
  return next;
}

function normalizeCatalog(trade: CopilotTrade, value: unknown): CopilotCatalogService[] {
  if (!Array.isArray(value)) return [];
  const pack = getCopilotTradePack(trade);
  const defaults = new Map(pack.defaultCatalog.map((service) => [service.code, service]));
  const seen = new Set<string>();
  const result: CopilotCatalogService[] = [];

  for (const entry of value.slice(0, 150)) {
    if (!isRecord(entry) || typeof entry.code !== "string") continue;
    const fallback = defaults.get(entry.code.trim());
    if (!fallback || seen.has(fallback.code)) continue;
    seen.add(fallback.code);

    const unitPriceHt = cleanNumber(entry.unitPriceHt, 0, 100_000) ?? fallback.unitPriceHt;
    const materialCostPerUnit = cleanNumber(entry.materialCostPerUnit, 0, 100_000) ?? fallback.materialCostPerUnit;
    const labourHoursPerUnit = cleanNumber(entry.labourHoursPerUnit, 0, 1_000) ?? fallback.labourHoursPerUnit;
    const taxRateCandidate = cleanNumber(entry.taxRate, 0, 20);
    const taxRate = taxRateCandidate !== null && [0, 5.5, 10, 20].includes(taxRateCandidate)
      ? taxRateCandidate
      : fallback.taxRate;

    result.push({
      ...fallback,
      label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim().slice(0, 180) : fallback.label,
      description: typeof entry.description === "string" ? entry.description.trim().slice(0, 600) : fallback.description,
      unitPriceHt,
      materialCostPerUnit,
      labourHoursPerUnit,
      taxRate,
      source: "company_catalog",
    });
  }

  return result;
}

function normalizeTradeProfile(trade: CopilotTrade, value: unknown): ForgeoTradeProfile {
  const pack = getCopilotTradePack(trade);
  const record = isRecord(value) ? value : {};
  const packVersion = Math.max(1, Math.round(cleanNumber(record.packVersion, 1, 10_000) ?? pack.version));
  return {
    trade,
    packVersion,
    settings: normalizeSettings(record.settings),
    catalog: normalizeCatalog(trade, record.catalog),
  };
}

function normalizeRules(value: unknown): ForgeoCompanyRule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const trade = resolveCopilotTrade(entry.trade, DEFAULT_COPILOT_TRADE);
    const instruction = typeof entry.instruction === "string" ? entry.instruction.trim().slice(0, 800) : "";
    if (!trade || !instruction) return [];
    return [{
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 120) : `rule-${index + 1}`,
      trade,
      instruction,
      active: entry.active !== false,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
    }];
  });
}

export function createDefaultForgeoBusinessProfile(primaryTrade: CopilotTrade = DEFAULT_COPILOT_TRADE): ForgeoBusinessProfile {
  const pack = getCopilotTradePack(primaryTrade);
  return {
    version: 1,
    primaryTrade,
    enabledTrades: [primaryTrade],
    trades: {
      [primaryTrade]: {
        trade: primaryTrade,
        packVersion: pack.version,
        settings: {},
        catalog: [],
      },
    },
    rules: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeForgeoBusinessProfile(value: unknown, legacyTrade?: unknown): ForgeoBusinessProfile {
  const legacyResolved = resolveCopilotTrade(legacyTrade, DEFAULT_COPILOT_TRADE) ?? DEFAULT_COPILOT_TRADE;
  if (!isRecord(value)) return createDefaultForgeoBusinessProfile(legacyResolved);

  const primaryTrade = resolveCopilotTrade(value.primaryTrade, legacyResolved) ?? legacyResolved;
  const enabledTrades = Array.isArray(value.enabledTrades)
    ? value.enabledTrades.flatMap((candidate) => {
        const resolved = resolveCopilotTrade(candidate, primaryTrade);
        return resolved ? [resolved] : [];
      })
    : [];
  const uniqueTrades = [...new Set<CopilotTrade>([primaryTrade, ...enabledTrades])];
  const rawTrades = isRecord(value.trades) ? value.trades : {};
  const trades: Partial<Record<CopilotTrade, ForgeoTradeProfile>> = {};
  for (const trade of uniqueTrades) {
    trades[trade] = normalizeTradeProfile(trade, rawTrades[trade]);
  }

  return {
    version: 1,
    primaryTrade,
    enabledTrades: uniqueTrades,
    trades,
    rules: normalizeRules(value.rules),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

export function readForgeoBusinessProfile(storage?: ReadStorage | null): ForgeoBusinessProfile {
  if (!storage) return createDefaultForgeoBusinessProfile();
  try {
    const legacyTrade = storage.getItem(LEGACY_TRADE_STORAGE_KEY);
    const raw = storage.getItem(FORGEO_BUSINESS_PROFILE_STORAGE_KEY);
    return normalizeForgeoBusinessProfile(raw ? JSON.parse(raw) : null, legacyTrade);
  } catch {
    return createDefaultForgeoBusinessProfile();
  }
}

export function writeForgeoBusinessProfile(profile: ForgeoBusinessProfile, storage?: WriteStorage | null) {
  if (!storage) return;
  const normalized = normalizeForgeoBusinessProfile({ ...profile, updatedAt: new Date().toISOString() });
  try {
    storage.setItem(FORGEO_BUSINESS_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    storage.setItem(LEGACY_TRADE_STORAGE_KEY, normalized.primaryTrade);
  } catch {
    // Le stockage local reste un pont temporaire avant la synchronisation Supabase authentifiée.
  }
}

export function getTradeProfile(profile: ForgeoBusinessProfile, trade: CopilotTrade = profile.primaryTrade): ForgeoTradeProfile {
  return profile.trades[trade] ?? normalizeTradeProfile(trade, null);
}

export function upsertTradeProfile(
  profile: ForgeoBusinessProfile,
  trade: CopilotTrade,
  patch: Partial<Pick<ForgeoTradeProfile, "settings" | "catalog">>,
): ForgeoBusinessProfile {
  const current = getTradeProfile(profile, trade);
  const enabledTrades = [...new Set<CopilotTrade>([...profile.enabledTrades, trade])];
  return normalizeForgeoBusinessProfile({
    ...profile,
    enabledTrades,
    trades: {
      ...profile.trades,
      [trade]: {
        ...current,
        settings: patch.settings === undefined ? current.settings : patch.settings,
        catalog: patch.catalog === undefined ? current.catalog : patch.catalog,
      },
    },
    updatedAt: new Date().toISOString(),
  });
}

export function changePrimaryTrade(profile: ForgeoBusinessProfile, trade: CopilotTrade): ForgeoBusinessProfile {
  const pack = getCopilotTradePack(trade);
  return normalizeForgeoBusinessProfile({
    ...profile,
    primaryTrade: trade,
    enabledTrades: [...profile.enabledTrades, trade],
    trades: {
      ...profile.trades,
      [trade]: profile.trades[trade] ?? {
        trade,
        packVersion: pack.version,
        settings: {},
        catalog: [],
      },
    },
    updatedAt: new Date().toISOString(),
  });
}
