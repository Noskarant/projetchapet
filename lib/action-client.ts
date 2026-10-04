import { supabase } from "@/lib/supabase";
import type { VoiceActionTarget } from "@/lib/action-planner";
import type { ExecutedVoiceAction } from "@/lib/voice-action-history";
import type { VoiceEmailDelivery } from "@/lib/voice-email-delivery";
import type { QuoteSource } from './quote-sources';

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

export type VoiceEmailQuoteChoice = {
  id: string;
  number: string;
  title: string;
  issueDate: string;
  total: number;
  sameBatch: boolean;
};

export type VoiceEmailQuoteChoices = {
  quotes: VoiceEmailQuoteChoice[];
  suggestedQuoteId: string | null;
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
  quoteSources = false,
  sourceTarget,
}: {
  organizationId: string;
  transcript: string;
  target: VoiceActionTarget;
  parsed?: unknown;
  signal?: AbortSignal;
  quoteSources?: boolean;
  sourceTarget?: "customer" | "quote";
}) {
  return authenticatedJson<{ batchReference: string | null; proposals: ActionProposalView[] }>(
    "/api/actions/plan",
    {
      method: "POST",
      signal,
      body: JSON.stringify({ organizationId, transcript, target, parsed, quoteSources, sourceTarget }),
    },
  );
}

export function extractQuoteSources(organizationId: string, sources: QuoteSource[], signal?: AbortSignal) {
  return authenticatedJson<{ observations: string }>('/api/ai/quote-sources', {
    method: 'POST', signal, body: JSON.stringify({ organizationId, sources }),
  });
}

export async function executeVoiceActions({
  organizationId,
  proposalIds,
  explicitConfirmation,
  directCreation = false,
}: {
  organizationId: string;
  proposalIds: string[];
  explicitConfirmation: boolean;
  directCreation?: boolean;
}) {
  return authenticatedJson<{ requiresExplicit: boolean; results: ActionExecutionResult[] }>(
    "/api/actions/execute",
    {
      method: "POST",
      body: JSON.stringify({ organizationId, proposalIds, explicitConfirmation, directCreation }),
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

export async function listVoiceEmailDeliveries(organizationId: string, proposalIds: string[]) {
  if (!proposalIds.length) return [];
  const batches = Array.from({ length: Math.ceil(proposalIds.length / 80) }, (_, index) => proposalIds.slice(index * 80, (index + 1) * 80));
  const results = await Promise.all(batches.map((ids) => supabase.from("voice_email_deliveries")
    .select("proposal_id,recipient,subject,body,status,provider_id,sent_at,attachment_quote_id,attachment_filename,created_at,updated_at")
    .eq("organization_id", organizationId).in("proposal_id", ids)));
  if (results.some((result) => result.error)) throw new Error("État des e-mails indisponible.");
  return results.flatMap((result) => result.data ?? []) as VoiceEmailDelivery[];
}

export async function listVoiceEmailQuoteChoices(organizationId: string, proposalId: string) {
  const params = new URLSearchParams({ organizationId, proposalId });
  return authenticatedJson<VoiceEmailQuoteChoices>(`/api/actions/email/quotes?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function sendVoiceEmailDraft({ organizationId, proposalId, subject, message, quoteId }: {
  organizationId: string; proposalId: string; subject: string; message: string; quoteId?: string | null;
}) {
  return authenticatedJson<{
    sent: true;
    sentAt: string;
    providerId: string;
    attachmentQuoteId: string | null;
    attachmentFilename: string | null;
  }>("/api/actions/email/send", {
    method: "POST",
    body: JSON.stringify({ organizationId, proposalId, subject, message, quoteId: quoteId ?? null }),
  });
}
