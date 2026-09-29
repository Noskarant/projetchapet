import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, isEmail, rateLimit } from "@/lib/api-guard";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";
import { suggestedVoiceQuoteId, type VoiceEmailQuoteChoice } from "@/lib/voice-email-quote-pdf";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "voice-email-quotes", 30);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId"));
    const proposalId = clean(url.searchParams.get("proposalId"));
    if (!organizationId || !uuid(proposalId)) throw new ApiInputError("Brouillon ou entreprise manquants.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId);

    const { data: proposal, error: proposalError } = await context.client
      .from("action_proposals")
      .select("id,source_reference,payload")
      .eq("id", proposalId)
      .eq("organization_id", organizationId)
      .eq("intent_type", "prepare_email")
      .eq("status", "executed")
      .maybeSingle();
    if (proposalError) throw new Error("Brouillon indisponible.");
    if (!proposal) throw new ApiInputError("Brouillon introuvable ou non validé.", 404);

    const payload = proposal.payload as Record<string, unknown>;
    const recipient = clean(payload.to).toLowerCase();
    if (!isEmail(recipient)) throw new ApiInputError("Adresse du destinataire invalide.");

    const { data: customerRows, error: customerError } = await context.client
      .from("customers")
      .select("id,emails")
      .eq("organization_id", organizationId)
      .limit(1000);
    if (customerError) throw new Error("Recherche du client impossible.");

    const customerIds = (customerRows ?? [])
      .filter((customer) => Array.isArray(customer.emails)
        && customer.emails.some((email: unknown) => clean(email).toLowerCase() === recipient))
      .map((customer) => String(customer.id));

    if (!customerIds.length) {
      return NextResponse.json({ quotes: [], suggestedQuoteId: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data: quoteRows, error: quoteError } = await context.client
      .from("quotes")
      .select("id,number,title,issue_date,total,created_at")
      .eq("organization_id", organizationId)
      .in("customer_id", customerIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (quoteError) throw new Error("Recherche des devis impossible.");

    const sameBatchQuoteIds = new Set<string>();
    if (proposal.source_reference) {
      const { data: batchQuotes, error: batchError } = await context.client
        .from("action_proposals")
        .select("execution_result")
        .eq("organization_id", organizationId)
        .eq("source_reference", proposal.source_reference)
        .eq("intent_type", "prepare_quote")
        .eq("status", "executed");
      if (batchError) throw new Error("Recherche des devis de la dictée impossible.");
      for (const action of batchQuotes ?? []) {
        const result = action.execution_result as Record<string, unknown> | null;
        if (result?.entityType === "quote" && typeof result.entityId === "string") {
          sameBatchQuoteIds.add(result.entityId);
        }
      }
    }

    const quotes: VoiceEmailQuoteChoice[] = (quoteRows ?? []).map((quote) => ({
      id: String(quote.id),
      number: String(quote.number ?? ""),
      title: String(quote.title ?? "Travaux"),
      issueDate: String(quote.issue_date ?? ""),
      total: Number(quote.total ?? 0),
      sameBatch: sameBatchQuoteIds.has(String(quote.id)),
    }));

    return NextResponse.json({
      quotes,
      suggestedQuoteId: suggestedVoiceQuoteId({
        subject: clean(payload.subject),
        body: clean(payload.body),
        quotes,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Les devis disponibles sont momentanément indisponibles.");
  }
}
