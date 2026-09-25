import { ApiInputError } from "@/lib/api-guard";
import type { PlannedAction } from "@/lib/action-planner";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return true;
}

function withMissing(action: PlannedAction, extraMissing: string[], extraWarnings: string[] = []): PlannedAction {
  const missingFields = [...new Set([...(action.missingFields ?? []), ...extraMissing])].slice(0, 30);
  const warnings = [...new Set([...(action.warnings ?? []), ...extraWarnings])].slice(0, 30);
  return {
    ...action,
    missingFields,
    warnings,
    status: missingFields.length ? "needs_input" : "ready",
  };
}

export function validatePlanDependencies(actions: PlannedAction[]) {
  for (let index = 0; index < actions.length; index += 1) {
    const dependencyIndex = actions[index].customerFromPosition;
    if (dependencyIndex === undefined) continue;
    if (!Number.isInteger(dependencyIndex)
      || dependencyIndex < 0
      || dependencyIndex >= index
      || actions[dependencyIndex]?.intentType !== "create_customer") {
      throw new ApiInputError("Le plan IA contient une dépendance client invalide.", 422);
    }
  }
}

export function hardenPlannedActions(actions: PlannedAction[]) {
  validatePlanDependencies(actions);

  return actions.map((action) => {
    const payload = record(action.payload);
    const missing: string[] = [];
    const warnings: string[] = [];

    if (action.intentType === "prepare_quote" || action.intentType === "prepare_invoice") {
      const items = Array.isArray(payload.items) ? payload.items : [];
      items.forEach((rawLine, index) => {
        const line = record(rawLine);
        const position = index + 1;
        const details: string[] = [];
        if (!text(line.label)) details.push("désignation");
        const quantity = finiteNumber(line.quantity);
        if (quantity === null || quantity <= 0) details.push("quantité");
        if (finiteNumber(line.unit_price) === null) details.push("prix HT");
        if (details.length) warnings.push(`Prestation ${position} à compléter dans le brouillon : ${details.join(", ")}.`);
        if (line.tax_rate === null || line.tax_rate === undefined) {
          warnings.push(`TVA à vérifier sur la prestation ${position}.`);
        }
      });
      if (!items.length && !text(payload.quote_id) && !text(payload.quote_number)) missing.push("prestations");
    }

    if (action.intentType === "schedule_task") {
      const date = text(payload.date);
      const time = text(payload.time);
      if (date && !validIsoDate(date)) missing.push("date");
      if (time && !validTime(time)) missing.push("heure");
    }

    if (action.intentType === "prepare_supplier_order") {
      const email = text(payload.supplier_email);
      if (email && !validEmail(email)) missing.push("email_fournisseur");
      const quantity = finiteNumber(payload.quantity);
      if (quantity === null || quantity <= 0) missing.push("quantite");
    }

    if (action.intentType === "prepare_email") {
      const recipient = text(payload.to);
      if (recipient && !validEmail(recipient)) missing.push("destinataire");
    }

    if (action.intentType === "mark_payment") {
      const amount = finiteNumber(payload.amount);
      if (amount === null || amount <= 0) missing.push("montant");
    }

    return withMissing(action, missing, warnings);
  });
}
