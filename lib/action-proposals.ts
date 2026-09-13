import { supabase } from "@/lib/supabase";
import type { ActionProposalInput } from "@/lib/action-engine";

export async function createActionProposal(input: ActionProposalInput) {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous.");

  const response = await fetch("/api/actions/proposals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "La proposition n’a pas pu être enregistrée.");
  return result.proposal;
}

export async function listActionProposals(organizationId: string, limit = 30) {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Votre session a expiré. Reconnectez-vous.");

  const params = new URLSearchParams({ organizationId, limit: String(limit) });
  const response = await fetch(`/api/actions/proposals?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Les propositions sont momentanément indisponibles.");
  return Array.isArray(result.proposals) ? result.proposals : [];
}
