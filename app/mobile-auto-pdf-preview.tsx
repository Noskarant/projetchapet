"use client";

import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  GripVertical,
  LockKeyhole,
  ReceiptText,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateQuotePreviewTotals,
  findQuoteByNumber,
  parseMobileWorkspace,
  readQuoteInternalMeta,
  writeQuoteInternalMeta,
  type QuoteInternalMeta,
} from "@/lib/mobile-quote-preview";
import {
  customerDisplayName,
  type LineItem,
  type MobileCustomer,
  type MobileQuote,
  type MobileWorkspace,
  type QuoteStatus,
} from "@/lib/mobile-prototype";

const WORKSPACE_STORAGE_KEY = "projetchapet-mobile-workspace-v3";
const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
const dateFr = (value: string) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
        new Date(`${value}T12:00:00`),
      )
    : "—";

function findLabel(root: ParentNode, label: string) {
  const wanted = normalize(label);
  return Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find((item) =>
    normalize(item.textContent || "").startsWith(wanted),
  );
}

function readControlValue(
  root: ParentNode,
  label: string,
  selector = "input, textarea, select",
) {
  const control = findLabel(root, label)?.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(selector);
  return control?.value ?? "";
}

function readWorkspace() {
  return parseMobileWorkspace(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
}

function findCustomer(workspace: MobileWorkspace | null, id: string) {
  return workspace?.customers.find((customer) => customer.id === id) ?? null;
}

function quoteStatus(value: string): QuoteStatus {
  return ["En attente", "Validé", "Terminé", "Refusé"].includes(value)
    ? (value as QuoteStatus)
    : "En attente";
}

function readQuoteFromEditor(editor: HTMLElement): {
  quote: MobileQuote;
  customer: MobileCustomer | null;
} | null {
  if (!normalize(editor.querySelector("h2")?.textContent || "").includes("devis")) {
    return null;
  }

  const workspace = readWorkspace();
  const customerId = readControlValue(editor, "Client", "select");
  const customer = findCustomer(workspace, customerId);
  const number = readControlValue(editor, "Numéro").trim() || "Devis en cours";
  const items = Array.from(
    editor.querySelectorAll<HTMLElement>(".rm-v2-lines article"),
  ).map((article, index): LineItem => {
    const designation = article.querySelector<HTMLInputElement>(":scope > input");
    const description = article.querySelector<HTMLTextAreaElement>(":scope > textarea");
    return {
      id: `preview-${index}`,
      label: designation?.value.trim() || `Prestation ${index + 1}`,
      description: description?.value.trim() || "",
      quantity: Number(readControlValue(article, "Quantité")) || 0,
      unit: readControlValue(article, "Unité") || "u",
      unitPrice: Number(readControlValue(article, "Prix HT")) || 0,
      taxRate: Number(readControlValue(article, "TVA %")) || 0,
    };
  });
  const totals = calculateQuotePreviewTotals(items, 0);

  return {
    customer,
    quote: {
      id: findQuoteByNumber(workspace, number)?.id || `preview-${number}`,
      number,
      customerId,
      customerName:
        customer?.id ? customerDisplayName(customer) : "Client à sélectionner",
      title: readControlValue(editor, "Objet / chantier") || "Travaux",
      issueDate: readControlValue(editor, "Date d’émission"),
      expiryDate: readControlValue(editor, "Date d’expiration"),
      status: quoteStatus(readControlValue(editor, "Statut", "select")),
      items,
      notes: readControlValue(editor, "Notes visibles sur le devis", "textarea"),
      subtotal: totals.grossSubtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
    },
  };
}

function updateLabelText(label: HTMLLabelElement, text: string) {
  const textNode = Array.from(label.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (textNode) textNode.textContent = text;
}

function enhanceQuoteEditor(editor: HTMLElement) {
  if (editor.dataset.philippeQuoteEditor === "true") return;
  if (!normalize(editor.querySelector("h2")?.textContent || "").includes("devis")) {
    return;
  }

  const stack = editor.querySelector<HTMLElement>(".rm-form-stack");
  const numberInput = findLabel(editor, "Numéro")?.querySelector<HTMLInputElement>("input");
  const publicNotesLabel = findLabel(editor, "Notes");
  if (!stack || !numberInput || !publicNotesLabel) return;

  editor.dataset.philippeQuoteEditor = "true";
  updateLabelText(publicNotesLabel, "Notes visibles sur le devis");

  const section = document.createElement("section");
  section.className = "rm-private-notes";
  section.dataset.philippePrivateNotes = "true";
  section.innerHTML = `
    <div class="rm-private-notes-heading">
      <span aria-hidden="true">🔒</span>
      <div>
        <strong>Notes personnelles</strong>
        <small>Informations internes, jamais visibles sur le devis ou le PDF client.</small>
      </div>
    </div>
    <label>
      Informations internes
      <textarea class="rm-private-notes-textarea" rows="4" placeholder="Ex. Sous-traitant : Entreprise Martin — devis de 1 850 €\nAccès chantier, marge prévue, rappel personnel…"></textarea>
    </label>
    <label class="rm-private-discount-label">
      Remise globale éventuelle
      <span><input class="rm-private-discount-input" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="0" /> %</span>
      <small>La remise est visible dans l’aperçu détaillé et sur la page complète du devis.</small>
    </label>
  `;
  publicNotesLabel.insertAdjacentElement("afterend", section);

  const notes = section.querySelector<HTMLTextAreaElement>(
    ".rm-private-notes-textarea",
  )!;
  const discount = section.querySelector<HTMLInputElement>(
    ".rm-private-discount-input",
  )!;

  const load = () => {
    const meta = readQuoteInternalMeta(window.localStorage, numberInput.value.trim());
    notes.value = meta.internalNotes;
    discount.value = String(meta.discountPercent);
  };
  const save = () => {
    const number = numberInput.value.trim();
    writeQuoteInternalMeta(window.localStorage, number, {
      internalNotes: notes.value,
      discountPercent: Number(discount.value),
    });
    window.dispatchEvent(
      new CustomEvent("projetchapet:quote-meta-changed", { detail: { number } }),
    );
  };

  notes.addEventListener("input", save);
  discount.addEventListener("input", save);
  numberInput.addEventListener("change", load);
  load();
}

async function buildQuotePdf(
  quote: MobileQuote,
  customer: MobileCustomer | null,
  meta: QuoteInternalMeta,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const totals = calculateQuotePreviewTotals(quote.items, meta.discountPercent);
  const margin = 16;
  let y = 18;

  const drawHeader = () => {
    pdf.setTextColor(16, 42, 67);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("CHAPET SAS", margin, y);
    pdf.setFontSize(18);
    pdf.text("DEVIS", 194, y, { align: "right" });
    pdf.setFontSize(10);
    pdf.text(quote.number, 194, y + 7, { align: "right" });
    y += 24;
    pdf.setDrawColor(210, 220, 232);
    pdf.line(margin, y, 194, y);
    y += 9;
  };

  drawHeader();
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("Client", margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(quote.customerName, margin, y + 6);
  const address = customer
    ? [customer.address, customer.postalCode, customer.city].filter(Boolean).join(" · ")
    : "";
  if (address) pdf.text(address, margin, y + 12);

  pdf.setFont("helvetica", "bold");
  pdf.text("Document", 120, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Émis le : ${dateFr(quote.issueDate)}`, 120, y + 6);
  pdf.text(`Valable jusqu’au : ${dateFr(quote.expiryDate)}`, 120, y + 12);
  pdf.text(`Objet : ${quote.title}`, 120, y + 18, { maxWidth: 74 });
  y += 32;

  const drawTableHeader = () => {
    pdf.setFillColor(239, 245, 251);
    pdf.rect(margin, y, 178, 9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("Désignation", margin + 2, y + 6);
    pdf.text("Qté", 118, y + 6, { align: "right" });
    pdf.text("PU HT", 145, y + 6, { align: "right" });
    pdf.text("TVA", 162, y + 6, { align: "right" });
    pdf.text("Total HT", 192, y + 6, { align: "right" });
    y += 13;
    pdf.setFont("helvetica", "normal");
  };

  drawTableHeader();
  for (const item of quote.items) {
    if (y > 250) {
      pdf.addPage();
      y = 18;
      drawHeader();
      drawTableHeader();
    }
    const labelLines = pdf.splitTextToSize(item.label || "Prestation", 88);
    pdf.text(labelLines, margin + 2, y);
    if (item.description) {
      pdf.setTextColor(95, 108, 124);
      pdf.setFontSize(7.5);
      pdf.text(pdf.splitTextToSize(item.description, 88), margin + 2, y + 5);
      pdf.setTextColor(16, 42, 67);
      pdf.setFontSize(8.5);
    }
    pdf.text(`${item.quantity} ${item.unit || ""}`.trim(), 118, y, {
      align: "right",
    });
    pdf.text(money(item.unitPrice), 145, y, { align: "right" });
    pdf.text(`${item.taxRate} %`, 162, y, { align: "right" });
    pdf.text(money(item.quantity * item.unitPrice), 192, y, { align: "right" });
    y += Math.max(12, labelLines.length * 4.5 + (item.description ? 6 : 0));
    pdf.setDrawColor(235, 239, 244);
    pdf.line(margin, y - 4, 194, y - 4);
  }

  y += 4;
  const totalX = 130;
  pdf.setFontSize(9);
  pdf.text("Sous-total HT", totalX, y);
  pdf.text(money(totals.grossSubtotal), 192, y, { align: "right" });
  if (totals.discountPercent > 0) {
    y += 7;
    pdf.text(`Remise (${totals.discountPercent} %)`, totalX, y);
    pdf.text(`- ${money(totals.discountAmount)}`, 192, y, { align: "right" });
  }
  y += 7;
  pdf.text("Total HT", totalX, y);
  pdf.text(money(totals.subtotal), 192, y, { align: "right" });
  y += 7;
  pdf.text("TVA", totalX, y);
  pdf.text(money(totals.taxTotal), 192, y, { align: "right" });
  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Total TTC", totalX, y);
  pdf.text(money(totals.total), 192, y, { align: "right" });

  if (quote.notes.trim()) {
    y += 15;
    pdf.setFontSize(9);
    pdf.text("Notes", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(pdf.splitTextToSize(quote.notes, 176), margin, y + 6);
  }

  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 110, 124);
  pdf.text("Document client — les notes personnelles internes sont exclues.", 105, 288, {
    align: "center",
  });
  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

type PreviewState = {
  quote: MobileQuote;
  customer: MobileCustomer | null;
  meta: QuoteInternalMeta;
  tab: "detail" | "page";
  pdfBlob: Blob | null;
  pdfUrl: string | null;
};

export default function MobileAutoPdfPreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.pdfUrl) URL.revokeObjectURL(current.pdfUrl);
      return null;
    });
  }, []);

  const openQuotePreview = useCallback(
    async (quote: MobileQuote, customer: MobileCustomer | null) => {
      const meta = readQuoteInternalMeta(window.localStorage, quote.number);
      setBusy(true);
      setPreview((current) => {
        if (current?.pdfUrl) URL.revokeObjectURL(current.pdfUrl);
        return {
          quote,
          customer,
          meta,
          tab: "detail",
          pdfBlob: null,
          pdfUrl: null,
        };
      });
      try {
        const pdfBlob = await buildQuotePdf(quote, customer, meta);
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPreview((current) => {
          if (!current || current.quote.number !== quote.number) {
            URL.revokeObjectURL(pdfUrl);
            return current;
          }
          return { ...current, pdfBlob, pdfUrl };
        });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const observer = new MutationObserver(() => {
      document
        .querySelectorAll<HTMLElement>(".rm-v2-editor")
        .forEach(enhanceQuoteEditor);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document
      .querySelectorAll<HTMLElement>(".rm-v2-editor")
      .forEach(enhanceQuoteEditor);

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;

      if (button.classList.contains("rm-document-card")) {
        window.setTimeout(() => {
          const detail = document.querySelector<HTMLElement>(".rm-detail-sheet");
          if (!detail || normalize(detail.querySelector("header small")?.textContent || "") !== "devis") {
            return;
          }
          const number = detail.querySelector("header h2")?.textContent?.trim() || "";
          const workspace = readWorkspace();
          const quote = findQuoteByNumber(workspace, number);
          if (quote) void openQuotePreview(quote, findCustomer(workspace, quote.customerId));
        }, 80);
        return;
      }

      if (!normalize(button.textContent || "").includes("aperçu pdf")) return;
      const editor = button.closest<HTMLElement>(".rm-v2-editor");
      const detail = button.closest<HTMLElement>(".rm-detail-sheet");
      let snapshot: { quote: MobileQuote; customer: MobileCustomer | null } | null = null;

      if (editor) snapshot = readQuoteFromEditor(editor);
      if (!snapshot && detail && normalize(detail.querySelector("header small")?.textContent || "") === "devis") {
        const workspace = readWorkspace();
        const number = detail.querySelector("header h2")?.textContent?.trim() || "";
        const quote = findQuoteByNumber(workspace, number);
        if (quote) snapshot = { quote, customer: findCustomer(workspace, quote.customerId) };
      }
      if (!snapshot) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openQuotePreview(snapshot.quote, snapshot.customer);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, [openQuotePreview]);

  useEffect(() => () => {
    if (preview?.pdfUrl) URL.revokeObjectURL(preview.pdfUrl);
  }, [preview?.pdfUrl]);

  const totals = useMemo(
    () =>
      preview
        ? calculateQuotePreviewTotals(
            preview.quote.items,
            preview.meta.discountPercent,
          )
        : null,
    [preview],
  );

  if (!preview || !totals) return null;

  return (
    <div className="rm-philippe-preview-backdrop" role="dialog" aria-modal="true">
      <section className="rm-philippe-preview">
        <header className="rm-philippe-preview-header">
          <button onClick={closePreview} aria-label="Fermer l’aperçu détaillé">
            <ArrowLeft size={21} />
          </button>
          <div>
            <small>APERÇU DU DEVIS</small>
            <h2>{preview.quote.number}</h2>
          </div>
          <button onClick={closePreview} aria-label="Fermer">
            <X size={21} />
          </button>
        </header>

        <div className="rm-philippe-summary">
          <div>
            <small>Client</small>
            <strong>{preview.quote.customerName}</strong>
            <span>{preview.quote.title}</span>
          </div>
          <div>
            <small>Émission</small>
            <strong>{dateFr(preview.quote.issueDate)}</strong>
            <span>Valable jusqu’au {dateFr(preview.quote.expiryDate)}</span>
          </div>
        </div>

        <nav className="rm-philippe-preview-tabs" aria-label="Modes d’aperçu">
          <button
            className={preview.tab === "detail" ? "active" : ""}
            onClick={() => setPreview({ ...preview, tab: "detail" })}
          >
            <Eye size={17} /> Détail des postes
          </button>
          <button
            className={preview.tab === "page" ? "active" : ""}
            onClick={() => setPreview({ ...preview, tab: "page" })}
          >
            <FileText size={17} /> Page complète
          </button>
        </nav>

        <div className="rm-philippe-preview-scroll">
          {preview.tab === "detail" ? (
            <>
              <div className="rm-philippe-section-title">
                <div>
                  <small>PRODUITS ET SERVICES</small>
                  <strong>{preview.quote.items.length} poste(s)</strong>
                </div>
                <span>Faites défiler pour tout consulter</span>
              </div>
              <div className="rm-philippe-lines">
                {preview.quote.items.map((item, index) => (
                  <article key={item.id || index} className="rm-philippe-line-card">
                    <div className="rm-philippe-line-head">
                      <div>
                        <small>POSTE {index + 1}</small>
                        <strong>{item.label || "Prestation"}</strong>
                      </div>
                      <GripVertical size={20} aria-hidden="true" />
                    </div>
                    {item.description && <p>{item.description}</p>}
                    <div className="rm-philippe-line-prices">
                      <div>
                        <small>Quantité</small>
                        <strong>{item.quantity} {item.unit}</strong>
                      </div>
                      <div>
                        <small>Prix unitaire HT</small>
                        <strong>{money(item.unitPrice)}</strong>
                      </div>
                      <div>
                        <small>Total HT</small>
                        <strong>{money(item.quantity * item.unitPrice)}</strong>
                      </div>
                    </div>
                    <div className="rm-philippe-line-tax">TVA {item.taxRate} %</div>
                  </article>
                ))}
              </div>
              {preview.meta.internalNotes.trim() && (
                <section className="rm-philippe-internal-card">
                  <LockKeyhole size={20} />
                  <div>
                    <small>NOTES PERSONNELLES — INTERNE UNIQUEMENT</small>
                    <p>{preview.meta.internalNotes}</p>
                    <span>Ces informations ne figurent jamais sur le PDF client.</span>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="rm-philippe-pdf-page">
              {preview.pdfUrl ? (
                <iframe
                  src={`${preview.pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                  title={`Page complète du devis ${preview.quote.number}`}
                />
              ) : (
                <div className="rm-philippe-pdf-loading">
                  <ReceiptText size={30} />
                  <strong>Génération de la page complète…</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="rm-philippe-totals" aria-label="Totaux du devis">
          <div>
            <small>Total HT</small>
            <strong>{money(totals.subtotal)}</strong>
          </div>
          <div>
            <small>TVA</small>
            <strong>{money(totals.taxTotal)}</strong>
          </div>
          <div className="primary">
            <small>Total TTC</small>
            <strong>{money(totals.total)}</strong>
          </div>
          <div className={totals.discountPercent > 0 ? "discount active" : "discount"}>
            <small>Remise</small>
            <strong>
              {totals.discountPercent > 0
                ? `-${totals.discountPercent} %`
                : "Aucune"}
            </strong>
            {totals.discountPercent > 0 && <span>-{money(totals.discountAmount)}</span>}
          </div>
        </aside>

        <footer className="rm-philippe-preview-actions">
          <button
            onClick={() => setPreview({ ...preview, tab: preview.tab === "detail" ? "page" : "detail" })}
          >
            {preview.tab === "detail" ? <FileText size={18} /> : <Eye size={18} />}
            {preview.tab === "detail" ? "Voir la page complète" : "Voir le détail"}
          </button>
          <button
            className="primary"
            disabled={!preview.pdfBlob || busy}
            onClick={() =>
              preview.pdfBlob && downloadBlob(preview.pdfBlob, `${preview.quote.number}.pdf`)
            }
          >
            <Download size={18} /> Télécharger
          </button>
        </footer>
      </section>
    </div>
  );
}
