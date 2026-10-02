"use client";

import { recalculatePercentageLines } from "@/lib/percentage-adjustments";
import { FIELD_INTERFACE_QUERY } from "@/lib/responsive-interface";
import QuoteSuggestions from './quote-suggestions';
import { applyQuoteSuggestion, type PriceHistoryQuote, type QuoteSuggestion } from '@/lib/quote-suggestions';
import { getActiveOrganizationId, saveQuote } from '@/lib/project-chapet';
import { quoteInputFromMobile } from '@/lib/mobile-desktop-sync';
import { supabase } from '@/lib/supabase';

import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  GripVertical,
  Trash2,
  LockKeyhole,
  ReceiptText,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildBusinessDocumentPdf } from "@/lib/mobile-document-pdf";
import PdfPages from "./pdf-pages";
import { loadPrivateQuoteMeta, savePrivateQuoteMeta } from "@/lib/quote-private-cloud";
import {
  calculateQuotePreviewTotals,
  QUOTE_META_STORAGE_KEY,
  quoteTaxBreakdown,
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

function readNullableNumber(root: ParentNode, label: string) {
  const raw = readControlValue(root, label).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
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
    const quantity = readNullableNumber(article, "Quantité");
    const unit = readControlValue(article, "Unité").trim() || null;
    const unitPrice = readNullableNumber(article, "Prix HT");
    const taxRate = readNullableNumber(article, "TVA %");
    return {
      id: `preview-${index}`,
      label: designation?.value.trim() || `Prestation ${index + 1}`,
      description: description?.value.trim() || "",
      quantity,
      unit,
      unitPrice,
      taxRate,
      incomplete: quantity === null || unit === null || unitPrice === null,
      provenance:
        quantity === null || unit === null || unitPrice === null
          ? "unknown"
          : "user_explicit",
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
    const meta = {
      internalNotes: notes.value,
      discountPercent: Number(discount.value),
    };
    writeQuoteInternalMeta(window.localStorage, number, meta);
    void savePrivateQuoteMeta(number, meta).catch((error) => {
      console.warn("[MANUFEO] Notes privées non synchronisées", error);
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
  return buildBusinessDocumentPdf({ document: quote, customer, company: {}, quoteMeta: meta });
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
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryQuote[]>([]);
  const previewQuoteId = preview?.quote.id;
  useEffect(() => {
    if (!previewQuoteId) return;
    let active = true;
    setPriceHistory([]);
    void (async () => {
      const organizationId = await getActiveOrganizationId();
      const { data, error } = await supabase.from('quotes').select('id,status,items:quote_items(label,unit,unit_price)').eq('organization_id', organizationId).eq('status', 'accepted').order('updated_at', { ascending: false }).limit(100);
      if (!error && active) setPriceHistory((data || []) as unknown as PriceHistoryQuote[]);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [previewQuoteId]);

  async function addSuggestion(suggestion: QuoteSuggestion, input: { quantity: number; unitPrice: number; taxRate: number; id: string }) {
    if (!preview) throw new Error('Ouvre à nouveau le devis.');
    const workspace = readWorkspace();
    const current = workspace?.quotes.find(item => item.id === preview.quote.id);
    if (!workspace || !current) throw new Error('Le devis est indisponible.');
    const changed = applyQuoteSuggestion(current, suggestion, input);
    const items = recalculatePercentageLines(changed.items);
    const totals = calculateQuotePreviewTotals(items, preview.meta.discountPercent);
    const quote = { ...changed, items, subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total };
    await saveQuote(quoteInputFromMobile(quote, quote.customerId), workspace.quotes.map(item => item.number), quote.id);
    const latest = readWorkspace() || workspace;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ ...latest, quotes: latest.quotes.map(item => item.id === quote.id ? quote : item) }));
    window.dispatchEvent(new Event('manufeo:local-workspace-updated'));
    await openQuotePreview(quote, preview.customer);
  }

  useEffect(() => {
    const saved = (() => { try { return JSON.parse(window.localStorage.getItem(QUOTE_META_STORAGE_KEY) || "{}"); } catch { return {}; } })() as Record<string, QuoteInternalMeta>;
    void loadPrivateQuoteMeta(window.localStorage).then((cloud) => {
      for (const [number, meta] of Object.entries(saved)) {
        if (!cloud[number]) void savePrivateQuoteMeta(number, meta).catch(() => undefined);
      }
    }).catch((error) => console.warn("[MANUFEO] Chargement des notes privées impossible", error));
  }, []);

  async function removeLine(id: string) {
    if (!preview) return;
    const workspace = readWorkspace();
    if (!workspace) return;
    const items = recalculatePercentageLines(preview.quote.items.filter(item => item.id !== id));
    const totals = calculateQuotePreviewTotals(items, preview.meta.discountPercent);
    const quote = { ...preview.quote, items, subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total };
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ ...workspace, quotes: workspace.quotes.map(item => item.id === quote.id ? quote : item) }));
    window.dispatchEvent(new Event("manufeo:local-workspace-updated"));
    setDeleteLineId(null);
    await openQuotePreview(quote, preview.customer);
  }

  const closePreview = useCallback(() => {
    setFullScreen(false);
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
    if (!window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;

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

        <QuoteSuggestions key={preview.quote.id} quote={preview.quote} history={priceHistory} onApply={addSuggestion}/>
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
            onClick={() => { setPreview({ ...preview, tab: "page" }); setFullScreen(true); }}
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
                  <article key={item.id || index} className="rm-philippe-line-card" style={{ touchAction: "pan-y" }} onTouchStart={event => { const touch = event.touches[0]; swipeStart.current = { x: touch.clientX, y: touch.clientY }; }} onTouchEnd={event => { const start = swipeStart.current, touch = event.changedTouches[0]; if (start && Math.abs(touch.clientX - start.x) > 55 && Math.abs(touch.clientY - start.y) < 40) setDeleteLineId(item.id); swipeStart.current = null; }}>
                    {deleteLineId === item.id && <button type="button" className="rm-swipe-delete" onClick={() => void removeLine(item.id)}><Trash2 size={18} /> Supprimer ce poste</button>}
                    <div className="rm-philippe-line-head">
                      <div>
                        <small>POSTE {index + 1}</small>
                        <strong>{item.label || "Prestation"}</strong>
                      </div>
                      <button type="button" aria-label={`Supprimer ${item.label}`} onClick={() => setDeleteLineId(deleteLineId === item.id ? null : item.id)}><Trash2 size={18} /></button>
                    </div>
                    {item.description && <p>{item.description}</p>}
                    <div className="rm-philippe-line-prices">
                      <div>
                        <small>Quantité</small>
                        <strong>{item.quantity === null ? "À préciser" : `${item.quantity} ${item.unit || ""}`}</strong>
                      </div>
                      <div>
                        <small>Prix unitaire HT</small>
                        <strong>{item.unitPrice === null ? "À préciser" : money(item.unitPrice)}</strong>
                      </div>
                      <div>
                        <small>Total HT</small>
                        <strong>{item.quantity === null || item.unitPrice === null ? "À préciser" : money(item.quantity * item.unitPrice)}</strong>
                      </div>
                    </div>
                    <div className="rm-philippe-line-tax">TVA {item.taxRate === null ? "À préciser" : `${item.taxRate} %`}</div>
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
                <PdfPages url={preview.pdfUrl} title={`Devis ${preview.quote.number}`} />
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
          {quoteTaxBreakdown(preview.quote.items, preview.meta.discountPercent).map((group) => <div key={group.rate}><small>TVA ({new Intl.NumberFormat("fr-FR").format(group.rate)} %)</small><strong>{money(group.amount)}</strong></div>)}
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
          <button disabled={!preview.pdfBlob} onClick={async () => {
            if (!preview.pdfBlob) return;
            const file = new File([preview.pdfBlob], `${preview.quote.number}.pdf`, { type: "application/pdf" });
            try {
              if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ files: [file], title: preview.quote.number });
              else downloadBlob(preview.pdfBlob, file.name);
            } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) downloadBlob(preview.pdfBlob, file.name); }
          }}><Share2 size={18} /> Partager / Fichiers</button>
        </footer>
      </section>
      {fullScreen && preview.pdfUrl && <div className="rm-document-fullscreen" role="dialog" aria-modal="true" aria-label={`PDF ${preview.quote.number}`}><header><strong>{preview.quote.number}</strong><button onClick={() => setFullScreen(false)} aria-label="Fermer le PDF plein écran"><X size={22} /></button></header><PdfPages url={preview.pdfUrl} title={`Devis ${preview.quote.number}`} /></div>}
    </div>
  );
}
