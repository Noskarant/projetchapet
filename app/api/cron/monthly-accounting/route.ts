import { runAutomaticInvoiceDelivery } from "@/lib/automatic-invoice-delivery";
import { zipArchive } from "@/lib/zip-archive";
import { accountingInvoicePdf } from "@/lib/accounting-invoice-pdf";
import type { Invoice } from "@/lib/project-chapet";
import { createServiceSupabase } from "@/lib/server-organization";
import { isEmail } from "@/lib/api-guard";
import { monthlyInvoiceCsv, previousCalendarMonth, type AccountingInvoice } from "@/lib/monthly-accounting";
import { resolveManufeoSender } from "@/lib/resend-email";

export const runtime = "nodejs";
export const maxDuration = 300;

async function monthlyPdf(name: string, label: string, invoices: AccountingInvoice[]) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const money = (amount: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount || 0);
  let y = 19;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("Relevé mensuel des factures", 16, y);
  pdf.setFontSize(10); pdf.text(`${name} · ${label}`, 16, y + 8);
  y += 21;
  pdf.setFontSize(8); pdf.text("Facture", 16, y); pdf.text("Date", 58, y); pdf.text("HT", 122, y, { align: "right" }); pdf.text("TVA", 155, y, { align: "right" }); pdf.text("TTC", 194, y, { align: "right" });
  for (const invoice of invoices) {
    y += 7;
    if (y > 270) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "normal");
    pdf.text(String(invoice.number).slice(0, 30), 16, y);
    pdf.text(invoice.issue_date, 58, y);
    pdf.text(money(Number(invoice.subtotal)), 122, y, { align: "right" });
    pdf.text(money(Number(invoice.tax_total)), 155, y, { align: "right" });
    pdf.text(money(Number(invoice.total)), 194, y, { align: "right" });
  }
  if (y > 255) { pdf.addPage(); y = 20; }
  y += 13;
  pdf.setFont("helvetica", "bold");
  pdf.text(`Total HT : ${money(invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0))}`, 16, y);
  pdf.text(`TVA : ${money(invoices.reduce((sum, invoice) => sum + Number(invoice.tax_total), 0))}`, 95, y);
  pdf.text(`TTC : ${money(invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0))}`, 194, y, { align: "right" });
  return Buffer.from(pdf.output("arraybuffer")).toString("base64");
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Envoi mensuel non configuré" }, { status: 503 });
  }

  try {
    const admin = createServiceSupabase();
    const { first, next, label } = previousCalendarMonth(new Date());
    const { data: snapshots, error: snapshotError } = await admin.from("pilot_workspace_snapshots")
      .select("organization_id, company_profile");
    if (snapshotError) throw snapshotError;
    const outcomes: Array<{ organizationId: string; status: string }> = [];

    for (const snapshot of snapshots ?? []) {
      try { await runAutomaticInvoiceDelivery(String(snapshot.organization_id)); }
      catch (error) { outcomes.push({ organizationId: String(snapshot.organization_id), status: "Envoi automatique à vérifier" }); }
      const profile = snapshot.company_profile as Record<string, unknown> | null;
      const recipient = String(profile?.accountingEmail || "").trim().toLowerCase();
      if (profile?.monthlyAccountingEnabled !== true || !isEmail(recipient) || !process.env.RESEND_API_KEY) continue;
      const organizationId = String(snapshot.organization_id);
      const { data: invoices, error: invoiceError } = await admin.from("invoices")
        .select("*, customer:customers(*), items:invoice_items(*)")
        .eq("organization_id", organizationId).gte("issue_date", first).lt("issue_date", next)
        .neq("status", "draft").or("status.neq.cancelled,total.lt.0").order("issue_date");
      if (invoiceError) { outcomes.push({ organizationId, status: "lecture impossible" }); continue; }
      const entries = (invoices ?? []) as unknown as AccountingInvoice[];
      if (!entries.length) continue;
      const { error: reservedError } = await admin.from("monthly_accounting_dispatches").insert({ organization_id: organizationId, month: first, recipient });
      if (reservedError) {
        outcomes.push({ organizationId, status: reservedError.code === "23505" ? "déjà envoyé" : "réservation impossible" });
        continue;
      }

      let providerAccepted = false;
      try {
        const name = typeof profile?.displayName === "string" && profile.displayName.trim() ? profile.displayName.trim() : "Votre entreprise";
        const stem = `releve-factures-${first.slice(0, 7)}`;
        const csv = monthlyInvoiceCsv(entries);
        const pdf = await monthlyPdf(name, label, entries);
        const files: Array<{ name: string; content: Buffer }> = [];
        for (const invoice of (invoices || []) as unknown as Invoice[]) files.push({ name: `${invoice.number}.pdf`, content: await accountingInvoicePdf(invoice, profile) });
        files.push({ name: `${stem}.csv`, content: Buffer.from(csv, "utf8") });
        const archive = zipArchive(files);
        if (archive.length > 25_000_000) throw new Error("Dossier comptable trop volumineux pour un seul envoi.");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `monthly-accounting/${organizationId}/${first}`,
          },
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({
            from: resolveManufeoSender(process.env.RESEND_FROM_EMAIL), to: [recipient],
            subject: `Relevé des factures · ${label} · ${name}`,
            html: `<p>Bonjour,</p><p>Veuillez trouver toutes les factures du mois en PDF dans le dossier ZIP, ainsi que le relevé et son export CSV pour ${label}.</p><p>MANUFEO</p>`,
            attachments: [
              { filename: `factures-${first.slice(0, 7)}.zip`, content: archive.toString("base64") },
              { filename: `${stem}.pdf`, content: pdf },
              { filename: `${stem}.csv`, content: Buffer.from(csv, "utf8").toString("base64") },
            ],
          }),
        });
        if (!response.ok) throw new Error(`Envoi refusé (${response.status})`);
        providerAccepted = true;
        const sent = await response.json() as { id?: string };
        const { error: updateError } = await admin.from("monthly_accounting_dispatches")
          .update({ provider_id: sent.id || null, sent_at: new Date().toISOString() })
          .eq("organization_id", organizationId).eq("month", first);
        if (updateError) throw updateError;
        outcomes.push({ organizationId, status: "envoyé" });
      } catch (error) {
        const uncertain = error instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(error.name);
        if (!providerAccepted && !uncertain) await admin.from("monthly_accounting_dispatches").delete().eq("organization_id", organizationId).eq("month", first);
        outcomes.push({ organizationId, status: providerAccepted ? "envoyé, accusé local indisponible" : uncertain ? "accusé incertain, à vérifier avant renvoi" : "échec, réessai demain" });
      }
    }
    return Response.json({ month: first, outcomes });
  } catch (error) {
    console.error("[MANUFEO] Relevé mensuel", error);
    return Response.json({ error: "Traitement comptable impossible" }, { status: 500 });
  }
}
