"use client";

import { useEffect } from "react";
import { sendAuthenticatedDocumentEmail } from "@/lib/authenticated-email";
import { companyProfileDisplayName, readCompanyProfile, type CompanyProfile } from "@/lib/company-profile";
import { blobToBase64 } from "@/lib/document-tools";
import type { MobileInvoice, MobileWorkspace } from "@/lib/mobile-prototype";

const STORAGE_KEY = "projetchapet-mobile-workspace-v3";

function text(root: ParentNode, selector: string, fallback = "") {
  return root.querySelector(selector)?.textContent?.trim() || fallback;
}

function notify(message: string) {
  const toast = document.createElement("div");
  toast.className = "rm-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function loadWorkspace() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as MobileWorkspace : null;
  } catch {
    return null;
  }
}

function persistAccountantState(number: string) {
  const workspace = loadWorkspace();
  if (!workspace) return;
  const invoices = workspace.invoices.map((invoice) => invoice.number === number
    ? { ...invoice, accountantSent: true }
    : invoice);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...workspace, invoices }));
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function dateFr(value: string) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`))
    : "—";
}

async function buildAccountingPdf(invoice: MobileInvoice, profile: CompanyProfile) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const companyName = companyProfileDisplayName(profile);
  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(companyName, 16, y);
  pdf.setFontSize(18);
  pdf.text(invoice.status === "Avoir" ? "AVOIR" : "FACTURE", 194, y, { align: "right" });
  pdf.setFontSize(10);
  pdf.text(invoice.number, 194, y + 7, { align: "right" });

  y += 25;
  pdf.setDrawColor(215, 223, 233);
  pdf.line(16, y, 194, y);
  y += 9;
  pdf.setFontSize(10);
  pdf.text("Client", 16, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(invoice.customerName, 16, y + 6);
  pdf.setFont("helvetica", "bold");
  pdf.text("Document", 122, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Émis le : ${dateFr(invoice.issueDate)}`, 122, y + 6);
  pdf.text(`Échéance : ${dateFr(invoice.dueDate)}`, 122, y + 12);

  y += 27;
  pdf.setFillColor(239, 245, 251);
  pdf.rect(16, y, 178, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("Désignation", 18, y + 6);
  pdf.text("Qté", 120, y + 6, { align: "right" });
  pdf.text("PU HT", 148, y + 6, { align: "right" });
  pdf.text("TVA", 165, y + 6, { align: "right" });
  pdf.text("Total HT", 192, y + 6, { align: "right" });
  y += 13;
  pdf.setFont("helvetica", "normal");

  for (const item of invoice.items) {
    if (y > 255) {
      pdf.addPage();
      y = 18;
    }
    const lines = pdf.splitTextToSize(item.label || "Prestation", 90);
    pdf.text(lines, 18, y);
    pdf.text(item.quantity === null ? "À préciser" : `${item.quantity} ${item.unit || ""}`.trim(), 120, y, { align: "right" });
    pdf.text(item.unitPrice === null ? "À préciser" : money(item.unitPrice), 148, y, { align: "right" });
    pdf.text(item.taxRate === null ? "À préciser" : `${item.taxRate} %`, 165, y, { align: "right" });
    pdf.text(item.quantity === null || item.unitPrice === null ? "À préciser" : money(item.quantity * item.unitPrice), 192, y, { align: "right" });
    if (item.description) {
      pdf.setTextColor(95, 108, 124);
      pdf.setFontSize(7.5);
      pdf.text(pdf.splitTextToSize(item.description, 90), 18, y + 5);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(8.5);
    }
    y += Math.max(11, lines.length * 4.5 + (item.description ? 5 : 0));
    pdf.setDrawColor(235, 239, 244);
    pdf.line(16, y - 4, 194, y - 4);
  }

  y += 5;
  pdf.text("Sous-total HT", 134, y);
  pdf.text(money(invoice.subtotal), 192, y, { align: "right" });
  y += 7;
  pdf.text("TVA", 134, y);
  pdf.text(money(invoice.taxTotal), 192, y, { align: "right" });
  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Total TTC", 134, y);
  pdf.text(money(invoice.total), 192, y, { align: "right" });

  if (invoice.notes) {
    y += 14;
    pdf.setFontSize(9);
    pdf.text("Notes", 16, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(pdf.splitTextToSize(invoice.notes, 176), 16, y + 6);
  }

  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 110, 124);
  pdf.text("Document généré avec FORGEO.", 105, 288, { align: "center" });
  return pdf.output("blob");
}

export default function MobileAccountingAction() {
  useEffect(() => {
    const handler = async (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.toLowerCase().includes("envoyer comptable")) return;
      const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (!sheet || text(sheet, "header small").toLowerCase() !== "facture") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      button.disabled = true;

      const number = text(sheet, "header h2", "Facture");
      const workspace = loadWorkspace();
      const invoice = workspace?.invoices.find((item) => item.number === number);
      const profile = readCompanyProfile(window.localStorage);

      try {
        if (!invoice) throw new Error("Facture introuvable dans votre espace.");
        if (!profile.accountingEmail) throw new Error("Renseignez l’e-mail du comptable dans le profil de votre entreprise.");
        const blob = await buildAccountingPdf(invoice, profile);
        const response = await sendAuthenticatedDocumentEmail({
          documentNumber: invoice.number,
          documentKind: "invoice",
          to: profile.accountingEmail,
          subject: `Facture ${number} — comptabilité`,
          html: `<p>Bonjour,</p><p>Veuillez trouver la facture <strong>${number}</strong> de ${invoice.customerName} en pièce jointe.</p><p>Cordialement,<br>${companyProfileDisplayName(profile)}</p>`,
          attachments: [{ filename: `${number}.pdf`, content: await blobToBase64(blob) }],
        });

        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || "Envoi comptable impossible.");
        }

        persistAccountantState(number);
        const state = sheet.querySelector<HTMLElement>(".rm-accountant-state strong");
        if (state) state.textContent = "Envoyée au comptable";
        notify(`Facture ${number} envoyée au comptable.`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Envoi comptable impossible.");
      } finally {
        button.disabled = false;
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
