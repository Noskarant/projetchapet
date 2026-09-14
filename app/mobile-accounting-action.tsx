"use client";

import { useEffect } from "react";
import { sendAuthenticatedDocumentEmail } from "@/lib/authenticated-email";
import { companyProfileDisplayName, readCompanyProfile } from "@/lib/company-profile";
import { blobToBase64 } from "@/lib/document-tools";
import { buildBusinessDocumentPdf, type BusinessDocumentCompany } from "@/lib/mobile-document-pdf";
import type { MobileWorkspace } from "@/lib/mobile-prototype";

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
        if (!workspace || !invoice) throw new Error("Facture introuvable dans votre espace.");
        if (!profile.accountingEmail) throw new Error("Renseignez l’e-mail du comptable dans le profil de votre entreprise.");

        const customer = workspace.customers.find((item) => item.id === invoice.customerId) ?? null;
        const company: BusinessDocumentCompany = {
          displayName: profile.displayName,
          legalName: profile.legalName,
          siret: profile.siret,
          vat: profile.vatNumber,
          address: profile.address,
          postalCode: profile.postalCode,
          city: profile.city,
          phone: profile.phone,
          email: profile.email,
        };
        const blob = await buildBusinessDocumentPdf({ document: invoice, customer, company });
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
