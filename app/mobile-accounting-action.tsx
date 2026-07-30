"use client";

import { useEffect } from "react";
import { blobToBase64 } from "@/lib/document-tools";

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
      const client = text(sheet, ".rm-detail-client strong", "Client");
      const amount = text(sheet, ".rm-detail-amount strong", "0,00 €");
      const issueDate = text(sheet, ".rm-detail-dates > div:first-child strong", "—");
      const dueDate = text(sheet, ".rm-detail-dates > div:last-child strong", "—");

      try {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ unit: "mm", format: "a4" });
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text("FACTURE", 194, 20, { align: "right" });
        pdf.setFontSize(11);
        pdf.text(number, 194, 28, { align: "right" });
        pdf.text("CHAPET SAS", 16, 20);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Client : ${client}`, 16, 46);
        pdf.text(`Émise le : ${issueDate}`, 16, 54);
        pdf.text(`Échéance : ${dueDate}`, 16, 62);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(20);
        pdf.text(`Total TTC : ${amount}`, 16, 82);
        const blob = pdf.output("blob");

        const response = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "compta@saschapet.com",
            subject: `Facture ${number} — comptabilité`,
            html: `<p>Bonjour,</p><p>Veuillez trouver la facture <strong>${number}</strong> de ${client} en pièce jointe.</p>`,
            attachments: [{ filename: `${number}.pdf`, content: await blobToBase64(blob) }],
          }),
        });

        if (!response.ok) {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${number}.pdf`;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1500);
          throw new Error("Envoi indisponible : le PDF a été téléchargé.");
        }

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
