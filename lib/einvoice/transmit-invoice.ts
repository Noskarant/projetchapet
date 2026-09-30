import { ApiInputError } from "@/lib/api-guard";
import { generateManufeoCii } from "@/lib/einvoice/manufeo-en16931";
import { eInvoiceServiceSupabase, getEInvoicePilotSnapshot, getValidSuperPdpAccessToken } from "@/lib/einvoice/server";
import { sendSuperPdpInvoice, superPdpConfiguration } from "@/lib/einvoice/superpdp";
import { normalizePilotSnapshot } from "@/lib/pilot-cloud-workspace";
function textField(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function providerStatus(source: Record<string, unknown>) {
  const direct = textField(source, "status", "state", "lifecycle_status");
  if (direct) return direct.slice(0, 120);
  const events = Array.isArray(source.events) ? source.events : [];
  const last = events.at(-1);
  if (last && typeof last === "object") {
    const event = textField(last as Record<string, unknown>, "status", "state", "type", "code");
    if (event) return event.slice(0, 120);
  }
  return "submitted";
}

export async function transmitOrganizationInvoice(organizationId: string, invoiceNumber: string) {
    const { configured, config } = superPdpConfiguration();
    if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré sur le serveur.", 503);

    const snapshot = await getEInvoicePilotSnapshot(organizationId);
    const normalized = normalizePilotSnapshot(snapshot.workspace, snapshot.companyProfile);
    const invoice = normalized.workspace.invoices.find((item) => item.number === invoiceNumber);
    if (!invoice) {
      throw new ApiInputError("Cette facture n’est pas encore synchronisée avec le cloud MANUFEO. Réessayez dans quelques secondes.", 409);
    }
    if (invoice.status === "Brouillon") {
      throw new ApiInputError("Passez la facture hors brouillon avant sa transmission réglementaire.");
    }
    const customer = normalized.workspace.customers.find((item) => item.id === invoice.customerId);
    if (!customer) throw new ApiInputError("Le client lié à cette facture est introuvable.");

    const generated = generateManufeoCii({
      company: normalized.companyProfile,
      customer,
      invoice,
    });
    const service = eInvoiceServiceSupabase();
    const prior = await service.from("einvoice_transmissions").select("status,provider_invoice_id").eq("organization_id", organizationId).eq("local_invoice_id", invoice.id).maybeSingle();
    if (prior.error) throw new Error("Vérification des transmissions impossible.");
    if (prior.data) {
      if (["submitting", "submission_unknown"].includes(prior.data.status)) throw new ApiInputError("Une transmission est en cours ou à vérifier auprès de la PDP. Aucun doublon n’a été envoyé.", 409);
      return { transmitted: true, provider: "superpdp", invoiceNumber: invoice.number, providerInvoiceId: prior.data.provider_invoice_id, status: prior.data.status, duplicate: true };
    }
    const token = await getValidSuperPdpAccessToken(organizationId);
    const reservation = await service.from("einvoice_transmissions").insert({ organization_id: organizationId, local_invoice_id: invoice.id, invoice_number: invoice.number, provider: "superpdp", external_id: invoice.number, direction: "out", status: "submitting", submitted_at: new Date().toISOString() });
    if (reservation.error) throw new ApiInputError("Cette facture est déjà en cours de transmission.", 409);
    const externalId = invoice.number;
    let response: Record<string, unknown>;
    try {
      response = await sendSuperPdpInvoice(config, token, {
      externalId,
      content: new Blob([generated.xml], { type: "application/xml" }),
      contentType: "application/xml",
    });

    } catch (error) {
      await service.from("einvoice_transmissions").update({ status: "submission_unknown", last_synced_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("local_invoice_id", invoice.id);
      throw error;
    }
    const providerInvoiceId = textField(response, "id", "invoice_id", "document_id");
    const status = providerStatus(response);
    const { error: storeError } = await service.from("einvoice_transmissions").upsert({
      organization_id: organizationId,
      local_invoice_id: invoice.id,
      invoice_number: invoice.number,
      provider: "superpdp",
      provider_invoice_id: providerInvoiceId || null,
      external_id: externalId,
      direction: "out",
      status,
      submitted_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "organization_id,local_invoice_id" });
    if (storeError) throw new Error("La facture a été transmise mais son accusé n’a pas pu être journalisé.");

    return {
      transmitted: true,
      provider: "superpdp",
      invoiceNumber: invoice.number,
      providerInvoiceId: providerInvoiceId || null,
      status,
      format: "CII",
      profile: "EN16931",
      validation: generated.validation,
    };
}
