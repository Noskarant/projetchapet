"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Mail, X } from "lucide-react";
import { fetchWorkspace, customerName, type Invoice, type Quote } from "@/lib/project-chapet";
import { blobToBase64, buildDocumentPdf, downloadDocumentPdf } from "@/lib/document-tools";

type BusinessDocument = Quote | Invoice;

type PreviewState = {
  document: BusinessDocument;
  url: string;
};

function isQuote(document: BusinessDocument): document is Quote {
  return "title" in document;
}

export default function DocumentPreviewBridge() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingNumber, setLoadingNumber] = useState("");
  const handledRef = useRef<string>("");

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    handledRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    let cancelled = false;

    async function openFromDetailsModal() {
      const modal = document.querySelector<HTMLElement>(".pc-crud-modal");
      const title = modal?.querySelector("h2")?.textContent?.trim() ?? "";
      if (!modal || !/^(DEV|FAC)-\d{4}-\d+$/i.test(title)) return;
      if (handledRef.current === title || loadingNumber === title) return;

      handledRef.current = title;
      setLoadingNumber(title);

      try {
        const workspace = await fetchWorkspace();
        const businessDocument = title.startsWith("DEV-")
          ? workspace.quotes.find((item) => item.number === title)
          : workspace.invoices.find((item) => item.number === title);

        if (!businessDocument || cancelled) {
          handledRef.current = "";
          return;
        }

        const blob = await buildDocumentPdf(businessDocument);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);

        const closeButton = modal.querySelector<HTMLButtonElement>("header button");
        closeButton?.click();
        setPreview({ document: businessDocument, url });
      } catch {
        handledRef.current = "";
      } finally {
        if (!cancelled) setLoadingNumber("");
      }
    }

    const observer = new MutationObserver(() => void openFromDetailsModal());
    observer.observe(document.body, { childList: true, subtree: true });
    void openFromDetailsModal();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [loadingNumber]);

  async function sendToClient() {
    if (!preview) return;
    const recipient = window.prompt(
      "Adresse e-mail du client",
      preview.document.customer.emails?.[0] ?? "",
    )?.trim();
    if (!recipient) return;

    setBusy(true);
    try {
      const blob = await buildDocumentPdf(preview.document);
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: `${isQuote(preview.document) ? "Votre devis" : "Votre facture"} ${preview.document.number}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><p>Bonjour,</p><p>Veuillez trouver votre ${isQuote(preview.document) ? "devis" : "facture"} <strong>${preview.document.number}</strong> en pièce jointe.</p><p>Cordialement,<br>CHAPET SAS</p></div>`,
          attachments: [{
            filename: `${preview.document.number}.pdf`,
            content: await blobToBase64(blob),
          }],
        }),
      });

      if (!response.ok) {
        await downloadDocumentPdf(preview.document);
        window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(preview.document.number)}&body=${encodeURIComponent("Bonjour,\n\nVeuillez trouver le PDF téléchargé à joindre à ce message.\n\nCordialement")}`;
      } else {
        window.alert(`Document envoyé à ${recipient}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {preview && (
        <div className="pc-pdf-preview-overlay" role="dialog" aria-modal="true">
          <section className="pc-pdf-preview-shell">
            <header>
              <div>
                <span>{isQuote(preview.document) ? "Devis" : "Facture"}</span>
                <h2>{preview.document.number}</h2>
                <p>{customerName(preview.document.customer)}</p>
              </div>
              <div className="pc-pdf-preview-actions">
                <button className="pc-secondary" onClick={() => void downloadDocumentPdf(preview.document)}>
                  <Download size={16} /> Télécharger
                </button>
                <button className="pc-primary" onClick={() => void sendToClient()} disabled={busy}>
                  {busy ? <Loader2 size={16} className="pc-spin" /> : <Mail size={16} />}
                  Envoyer au client
                </button>
                <button className="pc-icon-button" onClick={closePreview} aria-label="Fermer l’aperçu">
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="pc-pdf-frame-wrap">
              <iframe src={preview.url} title={`Aperçu PDF ${preview.document.number}`} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
