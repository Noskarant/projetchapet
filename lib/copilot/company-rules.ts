import type { ForgeoCompanyRule } from "./business-profile";
import type { CopilotTrade } from "./types";

export type CopilotCorrectionForRule = {
  id: string;
  trade: CopilotTrade;
  fieldName: string;
  validatedValue: unknown;
  context?: Record<string, unknown>;
};

function compactText(value: string, maxLength = 800) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function activeCompanyRulesForTrade(rules: ForgeoCompanyRule[], trade: CopilotTrade) {
  return rules.filter((rule) => rule.active && rule.trade === trade && compactText(rule.instruction).length > 0);
}

export function createCompanyRule(
  trade: CopilotTrade,
  instruction: string,
  id = `rule-${Date.now()}`,
): ForgeoCompanyRule | null {
  const normalized = compactText(instruction);
  if (normalized.length < 2) return null;
  return {
    id: compactText(id, 120) || `rule-${Date.now()}`,
    trade,
    instruction: normalized,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export function promoteCorrectionToCompanyRule(
  correction: CopilotCorrectionForRule,
  instruction: string,
): ForgeoCompanyRule | null {
  const normalized = compactText(instruction);
  if (normalized.length < 2) return null;
  return {
    id: `correction-${compactText(correction.id, 90)}`,
    trade: correction.trade,
    instruction: normalized,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

export function companyRuleAuditPayload(correction: CopilotCorrectionForRule) {
  return {
    correction_id: correction.id,
    trade: correction.trade,
    field_name: compactText(correction.fieldName, 160),
    validated_value: correction.validatedValue,
    context: correction.context ?? {},
  };
}
