import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import {
  isActionIntent,
  isActionSourceType,
  normalizeActionProposal,
  type ActionProposalInput,
} from "@/lib/action-engine";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

export const runtime = "nodejs";

function positiveLimit(value: string | null) {
  const parsed = Number(value ?? 30);
  if (!Number.isInteger(parsed)) return 30;
  return Math.max(1, Math.min(100, parsed));
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "action-proposals-read", 60);
  if (limited) return limited;

  try {
    const context = await authenticateRequest(request);
    const url = new URL(request.url);
    const organizationId = (url.searchParams.get("organizationId") ?? "").trim();
    if (!organizationId) throw new ApiInputError("Entreprise requise.");
    requireOrganization(context, organizationId);

    const { data, error } = await context.client
      .from("action_proposals")
      .select("id, organization_id, source_type, source_reference, intent_type, payload, risk_level, status, confidence, warnings, missing_fields, created_by, confirmed_by, confirmed_at, executed_at, execution_result, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(positiveLimit(url.searchParams.get("limit")));
    if (error) throw new Error("Les propositions MANUFEO sont momentanément indisponibles.");

    return NextResponse.json({ proposals: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Lecture des propositions impossible.");
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "action-proposals-create", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<Partial<ActionProposalInput>>(request, 40_000);
    if (!isActionSourceType(body.sourceType)) throw new ApiInputError("Source de proposition invalide.");
    if (!isActionIntent(body.intentType)) throw new ApiInputError("Action proposée invalide.");
    if (!body.organizationId || typeof body.organizationId !== "string") throw new ApiInputError("Entreprise requise.");
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw new ApiInputError("Contenu de proposition invalide.");

    let normalized;
    try {
      normalized = normalizeActionProposal(body as ActionProposalInput);
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "Proposition invalide.");
    }

    const context = await authenticateRequest(request);
    requireOrganization(context, normalized.organizationId);

    const { data, error } = await context.client
      .from("action_proposals")
      .insert({
        organization_id: normalized.organizationId,
        created_by: context.user.id,
        source_type: normalized.sourceType,
        source_reference: normalized.sourceReference,
        raw_text: normalized.rawText,
        intent_type: normalized.intentType,
        payload: normalized.payload,
        risk_level: normalized.riskLevel,
        status: normalized.status,
        confidence: normalized.confidence,
        warnings: normalized.warnings,
        missing_fields: normalized.missingFields,
      })
      .select("id, organization_id, source_type, source_reference, intent_type, payload, risk_level, status, confidence, warnings, missing_fields, created_by, created_at, updated_at")
      .single();
    if (error || !data) throw new Error("La proposition n’a pas pu être enregistrée.");

    return NextResponse.json({ proposal: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Création de proposition impossible.");
  }
}
