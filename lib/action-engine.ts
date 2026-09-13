export const ACTION_INTENTS = [
  "create_customer",
  "prepare_quote",
  "update_project_note",
  "prepare_supplier_order",
  "schedule_task",
  "prepare_invoice",
  "mark_payment",
  "prepare_email",
] as const;

export const ACTION_SOURCE_TYPES = [
  "voice",
  "text",
  "email",
  "document",
  "form",
  "system",
  "import",
] as const;

export type ActionIntent = (typeof ACTION_INTENTS)[number];
export type ActionSourceType = (typeof ACTION_SOURCE_TYPES)[number];
export type ActionRiskLevel = "low" | "review" | "explicit_confirmation";
export type ActionProposalStatus = "draft" | "needs_input" | "ready" | "confirmed" | "executed" | "rejected" | "failed";

export type ActionProposalInput = {
  organizationId: string;
  sourceType: ActionSourceType;
  sourceReference?: string | null;
  rawText?: string | null;
  intentType: ActionIntent;
  payload: Record<string, unknown>;
  riskLevel?: ActionRiskLevel;
  confidence?: number;
  warnings?: string[];
  missingFields?: string[];
};

export type NormalizedActionProposal = {
  organizationId: string;
  sourceType: ActionSourceType;
  sourceReference: string | null;
  rawText: string;
  intentType: ActionIntent;
  payload: Record<string, unknown>;
  riskLevel: ActionRiskLevel;
  confidence: number;
  warnings: string[];
  missingFields: string[];
  status: Extract<ActionProposalStatus, "needs_input" | "ready">;
};

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uniqueStrings(value: unknown, maxItems = 30, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function riskLevelForIntent(intent: ActionIntent): ActionRiskLevel {
  if (intent === "update_project_note") return "low";
  if (intent === "create_customer" || intent === "prepare_quote" || intent === "schedule_task") return "review";
  return "explicit_confirmation";
}

export function isActionIntent(value: unknown): value is ActionIntent {
  return typeof value === "string" && ACTION_INTENTS.includes(value as ActionIntent);
}

export function isActionSourceType(value: unknown): value is ActionSourceType {
  return typeof value === "string" && ACTION_SOURCE_TYPES.includes(value as ActionSourceType);
}

export function normalizeActionProposal(input: ActionProposalInput): NormalizedActionProposal {
  const organizationId = cleanText(input.organizationId, 80);
  if (!organizationId) throw new Error("organizationId manquant");
  if (!isActionSourceType(input.sourceType)) throw new Error("sourceType invalide");
  if (!isActionIntent(input.intentType)) throw new Error("intentType invalide");
  if (!isRecord(input.payload)) throw new Error("payload invalide");

  const warnings = uniqueStrings(input.warnings);
  const missingFields = uniqueStrings(input.missingFields, 30, 120);
  const confidence = Number.isFinite(Number(input.confidence))
    ? Math.max(0, Math.min(1, Number(input.confidence)))
    : 0;
  const expectedRisk = riskLevelForIntent(input.intentType);
  const requestedRisk = input.riskLevel;
  const riskLevel: ActionRiskLevel =
    requestedRisk === "explicit_confirmation" || expectedRisk === "explicit_confirmation"
      ? "explicit_confirmation"
      : requestedRisk === "review" || expectedRisk === "review"
        ? "review"
        : "low";

  return {
    organizationId,
    sourceType: input.sourceType,
    sourceReference: cleanText(input.sourceReference, 500) || null,
    rawText: cleanText(input.rawText, 20_000),
    intentType: input.intentType,
    payload: input.payload,
    riskLevel,
    confidence,
    warnings,
    missingFields,
    status: missingFields.length ? "needs_input" : "ready",
  };
}
