import { supabase } from "@/lib/supabase";
import type { VoiceActionTarget } from "@/lib/action-planner";
import type { ExecutedVoiceAction } from "@/lib/voice-action-history";

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
  signal,
}: {
  organizationId: string;
  transcript: string;
  target: VoiceActionTarget;
  parsed?: unknown;
  signal?: AbortSignal;
}) {
  return authenticatedJson<{ batchReference: string | null; proposals: ActionProposalView[] }>(
    "/api/actions/plan",
    {
      method: "POST",
      signal,
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

export async function listExecutedVoiceActions(organizationId: string, intentType: "schedule_task" | "prepare_email") {
  const { data, error } = await supabase.from("action_proposals")
    .select("id,payload,created_at")
    .eq("organization_id", organizationId)
    .eq("intent_type", intentType)
    .eq("status", "executed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Chargement des actions vocales impossible.");
  return (data ?? []) as ExecutedVoiceAction[];
}
