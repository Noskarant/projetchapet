import { supabase } from "@/lib/supabase";
import type { VoiceActionTarget } from "@/lib/action-planner";

export type ActionProposalView = {
  id: string;
  organization_id: string;
  source_type: string;
  source_reference: string | null;
  raw_text: string;
  intent_type: string;
  payload: Record<string, unknown>;
  risk_level: "low" | "review" | "explicit_confirmation";
  status: "draft" | "needs_input" | "ready" | "confirmed" | "executed" | "rejected" | "failed";
  confidence: number;
  warnings: string[];
  missing_fields: string[];
  created_at?: string;
};

export type ActionExecutionResult = {
  proposalId: string;
  intentType: string;
  entityType: string;
  entityId: string | null;
  message: string;
  clientAction?: "agenda";
  clientPayload?: Record<string, unknown>;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous.");
  return token;
}

async function authenticatedJson<T>(url: string, init: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result?.error === "string" ? result.error : "MANUFEO n’a pas pu traiter cette demande.");
  }
  return result as T;
}

export async function planVoiceActions({
  organizationId,
  transcript,
  target,
  parsed,
}: {
  organizationId: string;
  transcript: string;
  target: VoiceActionTarget;
  parsed?: unknown;
}) {
  return authenticatedJson<{ batchReference: string | null; proposals: ActionProposalView[] }>(
    "/api/actions/plan",
    {
      method: "POST",
      body: JSON.stringify({ organizationId, transcript, target, parsed }),
    },
  );
}

export async function executeVoiceActions({
  organizationId,
  proposalIds,
  explicitConfirmation,
}: {
  organizationId: string;
  proposalIds: string[];
  explicitConfirmation: boolean;
}) {
  return authenticatedJson<{ requiresExplicit: boolean; results: ActionExecutionResult[] }>(
    "/api/actions/execute",
    {
      method: "POST",
      body: JSON.stringify({ organizationId, proposalIds, explicitConfirmation }),
    },
  );
}
