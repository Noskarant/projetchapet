"use client";

import { useCallback, useEffect, useState } from "react";
import { parseMobileWorkspace } from "@/lib/mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import type { MobileInvoice, MobileWorkspace, QuoteStatus } from "@/lib/mobile-prototype";

type ActiveQuote = {
  id: string;
  number: string;
  customerName: string;
  title: string;
  issueDate: string;
  expiryDate: string;
  status: QuoteStatus;
  itemCount: number;
  linkedInvoice: MobileInvoice | null;
};

const STATUSES: QuoteStatus[] = ["En attente", "Validé", "Terminé", "Refusé"];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readWorkspace(): MobileWorkspace | null {
  try {
    return parseMobileWorkspace(window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function quoteFromPreview(preview: HTMLElement): ActiveQuote | null {
  const number = preview.querySelector(".rm-philippe-preview-header h2")?.textContent?.trim() || "";
  const workspace = readWorkspace();
  const quote = workspace?.quotes.find((item) => item.number === number);
  if (!quote || !workspace) return null;
  return {
    id: quote.id,
    number: quote.number,
    customerName: quote.customerName,
    title: quote.title,
    issueDate: quote.issueDate,
    expiryDate: quote.expiryDate,
    status: quote.status,
    itemCount: quote.items.length,
    linkedInvoice: workspace.invoices.find((invoice) => invoice.sourceQuoteId === quote.id) || null,
  };
}

function findUnderlyingDetail(number: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".rm-detail-sheet")).find((detail) => {
    const kind = normalize(detail.querySelector("header small")?.textContent || "");
    const heading = detail.querySelector("header h2")?.textContent?.trim() || "";
    return kind === "devis" && heading === number;
  }) || null;
}

function findAction(detail: HTMLElement | null, pattern: RegExp) {
  if (!detail) return null;
  return Array.from(detail.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    pattern.test(normalize(button.textContent || "")),
  ) || null;
}

function closePreviewOnly() {
  const headerButtons = document.querySelectorAll<HTMLButtonElement>(
    ".rm-philippe-preview-header > button",
  );
  const close = headerButtons[headerButtons.length - 1];
  close?.click();
}

function formatDate(value: string) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function makeButton(label: string, icon: string, action: string, handler: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rm-unified-quote-action";
  button.dataset.unifiedQuoteAction = action;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<b aria-hidden="true">${icon}</b><span>${label}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
  return button;
}

export default function MobileUnifiedQuoteSheet() {
  const [active, setActive] = useState<ActiveQuote | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const runUnderlyingAction = useCallback((number: string, pattern: RegExp) => {
    const detail = findUnderlyingDetail(number);
    const action = findAction(detail, pattern);
    if (!action) return;
    closePreviewOnly();
    window.setTimeout(() => action.click(), 40);
  }, []);

  const openVoiceEdit = useCallback((number: string) => {
    const detail = findUnderlyingDetail(number);
    const voice = detail?.querySelector<HTMLButtonElement>("[data-voice-edit]") || null;
    if (voice) {
      voice.click();
      return;
    }
    window.setTimeout(() => {
      findUnderlyingDetail(number)
        ?.querySelector<HTMLButtonElement>("[data-voice-edit]")
        ?.click();
    }, 120);
  }, []);

  const downloadCurrentPdf = useCallback(() => {
    const footer = document.querySelector<HTMLElement>(".rm-philippe-preview-actions");
    const download = Array.from(footer?.querySelectorAll<HTMLButtonElement>("button") || []).find(
      (button) =>
        !button.dataset.unifiedQuoteAction &&
        normalize(button.textContent || "").includes("telecharger"),
    );
    download?.click();
  }, []);

  const changeStatus = useCallback((status: QuoteStatus) => {
    if (!active) return;
    const detail = findUnderlyingDetail(active.number);
    const button = Array.from(
      detail?.querySelectorAll<HTMLButtonElement>(".rm-status-editor button") || [],
    ).find((item) => normalize(item.textContent || "") === normalize(status));
    button?.click();
    setActive((current) => (current ? { ...current, status } : current));
    setStatusOpen(false);
  }, [active]);

  useEffect(() => {
    const clearUi = () => {
      document.body.classList.remove("rm-unified-quote-open");
      setActive(null);
      setStatusOpen(false);
      setMoreOpen(false);
    };

    const showHistory = (preview: HTMLElement) => {
      const scroll = preview.querySelector<HTMLElement>(".rm-philippe-preview-scroll");
      const tabs = preview.querySelector<HTMLElement>(".rm-philippe-preview-tabs");
      if (!scroll || !tabs) return;
      scroll.classList.add("rm-unified-history-active");
      tabs.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
      tabs.querySelector<HTMLButtonElement>("[data-unified-history-tab]")?.classList.add("active");
    };

    const leaveHistory = (preview: HTMLElement) => {
      preview
        .querySelector<HTMLElement>(".rm-philippe-preview-scroll")
        ?.classList.remove("rm-unified-history-active");
      preview
        .querySelector<HTMLButtonElement>("[data-unified-history-tab]")
        ?.classList.remove("active");
    };

    const enhance = () => {
      const preview = document.querySelector<HTMLElement>(".rm-philippe-preview");
      if (!preview) {
        if (document.body.classList.contains("rm-unified-quote-open")) clearUi();
        return;
      }

      const quote = quoteFromPreview(preview);
      if (!quote) return;
      document.body.classList.add("rm-unified-quote-open");
      preview.dataset.unifiedQuoteSheet = "true";
      preview
        .closest<HTMLElement>(".rm-philippe-preview-backdrop")
        ?.setAttribute("aria-label", "Fiche du devis");

      setActive((current) => {
        if (
          current?.number === quote.number &&
          current.status === quote.status &&
          current.linkedInvoice?.number === quote.linkedInvoice?.number
        ) {
          return current;
        }
        return quote;
      });

      const header = preview.querySelector<HTMLElement>(".rm-philippe-preview-header");
      const headerLabel = header?.querySelector("small");
      if (headerLabel && headerLabel.textContent !== "FICHE DU DEVIS") {
        headerLabel.textContent = "FICHE DU DEVIS";
      }
      const headerButtons = header?.querySelectorAll<HTMLButtonElement>(":scope > button");
      const backButton = headerButtons?.[0];
      const closeButton = headerButtons?.[headerButtons.length - 1];
      if (backButton) {
        backButton.setAttribute("aria-label", "Retour aux devis");
        if (backButton.dataset.unifiedReturn !== "true") {
          backButton.dataset.unifiedReturn = "true";
          backButton.addEventListener(
            "click",
            () => {
              const detail = findUnderlyingDetail(quote.number);
              const back =
                detail?.querySelector<HTMLButtonElement>("header > button:first-child") || null;
              window.setTimeout(() => back?.click(), 0);
            },
            true,
          );
        }
      }
      if (closeButton) {
        closeButton.setAttribute("aria-hidden", "true");
        closeButton.tabIndex = -1;
      }

      const summary = preview.querySelector<HTMLElement>(".rm-philippe-summary");
      if (summary) {
        let status = summary.querySelector<HTMLButtonElement>("[data-unified-status]");
        if (!status) {
          status = document.createElement("button");
          status.type = "button";
          status.dataset.unifiedStatus = "true";
          status.className = "rm-unified-status-button";
          status.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setMoreOpen(false);
            setStatusOpen(true);
          });
          summary.append(status);
        }
        const nextText = `Statut : ${quote.status}`;
        if (status.textContent !== nextText) status.textContent = nextText;
        status.setAttribute("aria-label", `Changer le statut, actuellement ${quote.status}`);
        status.dataset.status = normalize(quote.status).replaceAll(" ", "-");
      }

      const tabs = preview.querySelector<HTMLElement>(".rm-philippe-preview-tabs");
      if (tabs) {
        const baseButtons = Array.from(
          tabs.querySelectorAll<HTMLButtonElement>(":scope > button:not([data-unified-history-tab])"),
        ).slice(0, 2);
        if (baseButtons[0]) {
          if (baseButtons[0].textContent !== "Détail") baseButtons[0].textContent = "Détail";
          baseButtons[0].setAttribute("aria-label", "Détail");
        }
        if (baseButtons[1]) {
          if (baseButtons[1].textContent !== "PDF") baseButtons[1].textContent = "PDF";
          baseButtons[1].setAttribute("aria-label", "PDF");
        }
        for (const button of baseButtons) {
          if (button.dataset.unifiedBaseTab !== "true") {
            button.dataset.unifiedBaseTab = "true";
            button.addEventListener("click", () => leaveHistory(preview), true);
          }
        }

        let history = tabs.querySelector<HTMLButtonElement>("[data-unified-history-tab]");
        if (!history) {
          history = document.createElement("button");
          history.type = "button";
          history.dataset.unifiedHistoryTab = "true";
          history.textContent = "Historique";
          history.setAttribute("aria-label", "Historique");
          history.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showHistory(preview);
          });
          tabs.append(history);
        }
      }

      const scroll = preview.querySelector<HTMLElement>(".rm-philippe-preview-scroll");
      if (scroll) {
        let historyPanel = scroll.querySelector<HTMLElement>(".rm-unified-history-panel");
        if (!historyPanel) {
          historyPanel = document.createElement("section");
          historyPanel.className = "rm-unified-history-panel";
          scroll.append(historyPanel);
        }
        const invoiceText = quote.linkedInvoice
          ? `${quote.linkedInvoice.number} · ${quote.linkedInvoice.status}`
          : "Aucune facture liée";
        const historyMarkup = `
          <div class="rm-unified-history-heading">
            <small>SUIVI DU DOCUMENT</small>
            <strong>${quote.number}</strong>
            <span>${quote.customerName}</span>
          </div>
          <div class="rm-unified-timeline">
            <article><b>1</b><div><small>ÉMISSION</small><strong>${formatDate(quote.issueDate)}</strong><span>${quote.itemCount} poste(s) · ${quote.title}</span></div></article>
            <article><b>2</b><div><small>STATUT ACTUEL</small><strong>${quote.status}</strong><span>Le document reste conservé dans l’historique général.</span></div></article>
            <article><b>3</b><div><small>VALIDITÉ</small><strong>${formatDate(quote.expiryDate)}</strong><span>Date d’expiration enregistrée sur le devis.</span></div></article>
            <article><b>4</b><div><small>FACTURATION LIÉE</small><strong>${invoiceText}</strong><span>${quote.linkedInvoice ? "La facture est reliée à ce devis." : "Le devis n’a pas encore été transformé en facture."}</span></div></article>
          </div>`;
        const snapshot = `${quote.number}|${quote.status}|${quote.linkedInvoice?.number || ""}|${quote.linkedInvoice?.status || ""}`;
        if (historyPanel.dataset.snapshot !== snapshot) {
          historyPanel.dataset.snapshot = snapshot;
          historyPanel.innerHTML = historyMarkup;
        }
      }

      const footer = preview.querySelector<HTMLElement>(".rm-philippe-preview-actions");
      if (footer) {
        Array.from(footer.children).forEach((child) => {
          const element = child as HTMLElement;
          if (!element.dataset.unifiedQuoteAction) {
            element.dataset.unifiedOriginalAction = "true";
            element.style.display = "none";
          }
        });

        if (!footer.querySelector("[data-unified-quote-action='edit']")) {
          footer.append(
            makeButton("Modifier", "✎", "edit", () =>
              runUnderlyingAction(quote.number, /tout modifier|modifier$/),
            ),
            makeButton("Modifier à la voix", "🎙", "voice", () =>
              openVoiceEdit(quote.number),
            ),
            makeButton("Changer le statut", "✓", "status", () => {
              setMoreOpen(false);
              setStatusOpen(true);
            }),
            makeButton("Plus", "•••", "more", () => {
              setStatusOpen(false);
              setMoreOpen(true);
            }),
          );
        }
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.body.classList.remove("rm-unified-quote-open");
    };
  }, [openVoiceEdit, runUnderlyingAction]);

  return (
    <>
      <style>{`
        @media (max-width: 820px) {
          body.rm-unified-quote-open .rm-detail-sheet { visibility: hidden; }
          body.rm-unified-quote-open .rm-philippe-preview-header > button:last-child { visibility: hidden; }
          body.rm-unified-quote-open .rm-philippe-preview-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          body.rm-unified-quote-open .rm-philippe-preview-tabs button { min-width: 0; }
          .rm-unified-status-button {
            grid-column: 1 / -1;
            min-height: 42px;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 13px;
            background: rgba(255,255,255,.1);
            color: #fff;
            font-weight: 850;
          }
          .rm-unified-status-button[data-status="en-attente"] { color: #ffd895; }
          .rm-unified-status-button[data-status="valide"] { color: #9be7bb; }
          .rm-unified-status-button[data-status="termine"] { color: #9fc9ff; }
          .rm-unified-status-button[data-status="refuse"] { color: #ffadb8; }
          .rm-philippe-preview-scroll.rm-unified-history-active > :not(.rm-unified-history-panel) { display: none !important; }
          .rm-unified-history-panel { display: none; }
          .rm-philippe-preview-scroll.rm-unified-history-active .rm-unified-history-panel { display: grid; gap: 14px; }
          .rm-unified-history-heading, .rm-unified-timeline article {
            border: 1px solid #d9e4ee;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 9px 26px rgba(20,45,72,.08);
          }
          .rm-unified-history-heading { display: grid; gap: 4px; padding: 16px; }
          .rm-unified-history-heading small, .rm-unified-timeline small { color: #75899d; font-size: 9px; font-weight: 850; letter-spacing: .1em; }
          .rm-unified-history-heading strong { color: #102a43; font-size: 20px; }
          .rm-unified-history-heading span, .rm-unified-timeline span { color: #60758b; font-size: 11px; line-height: 1.4; }
          .rm-unified-timeline { display: grid; gap: 10px; }
          .rm-unified-timeline article { display: grid; grid-template-columns: 34px 1fr; gap: 11px; padding: 14px; }
          .rm-unified-timeline article > b { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 50%; background: #102a43; color: #fff; }
          .rm-unified-timeline article div { display: grid; gap: 4px; }
          .rm-unified-timeline strong { color: #102a43; font-size: 14px; }
          body.rm-unified-quote-open .rm-philippe-preview-actions {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
          }
          .rm-unified-quote-action {
            display: flex !important;
            min-width: 0;
            min-height: 58px !important;
            flex-direction: column;
            gap: 3px !important;
            padding: 6px 3px;
            border-color: #d5e0ea !important;
            background: #fff !important;
            color: #102a43 !important;
          }
          .rm-unified-quote-action b { font-size: 16px; line-height: 1; }
          .rm-unified-quote-action span { overflow: hidden; max-width: 100%; font-size: 9px; line-height: 1.1; text-align: center; text-overflow: ellipsis; }
          .rm-unified-sheet-backdrop {
            position: fixed;
            inset: 0;
            z-index: 7200;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            background: rgba(2,10,26,.68);
            backdrop-filter: blur(9px);
          }
          .rm-unified-sheet {
            width: min(100%, 760px);
            max-height: 78dvh;
            overflow-y: auto;
            padding: 18px 16px max(18px, env(safe-area-inset-bottom));
            border-radius: 26px 26px 0 0;
            background: #fff;
            color: #102a43;
            box-shadow: 0 -22px 60px rgba(0,0,0,.28);
          }
          .rm-unified-sheet header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
          .rm-unified-sheet header div { display: grid; gap: 3px; }
          .rm-unified-sheet header small { color: #718398; font-size: 9px; font-weight: 850; letter-spacing: .11em; }
          .rm-unified-sheet header strong { font-size: 19px; }
          .rm-unified-sheet header button { width: 42px; height: 42px; border: 0; border-radius: 13px; background: #edf2f7; color: #102a43; font-size: 22px; }
          .rm-unified-sheet-list { display: grid; gap: 9px; }
          .rm-unified-sheet-list button {
            display: grid;
            grid-template-columns: 38px 1fr;
            gap: 11px;
            align-items: center;
            min-height: 54px;
            padding: 11px 13px;
            border: 1px solid #d8e2ec;
            border-radius: 15px;
            background: #fff;
            color: #102a43;
            text-align: left;
            font-weight: 800;
          }
          .rm-unified-sheet-list button > span:first-child { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 11px; background: #edf4ff; }
          .rm-unified-sheet-list button.active { border-color: #2e6bc6; background: #eef5ff; }
          .rm-unified-sheet-list button.danger { color: #b52e42; }
        }
      `}</style>

      {active && statusOpen && (
        <div
          className="rm-unified-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Changer le statut du devis"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStatusOpen(false);
          }}
        >
          <section className="rm-unified-sheet">
            <header>
              <div><small>DEVIS {active.number}</small><strong>Changer le statut</strong></div>
              <button onClick={() => setStatusOpen(false)} aria-label="Fermer">×</button>
            </header>
            <div className="rm-unified-sheet-list">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  className={active.status === status ? "active" : ""}
                  onClick={() => changeStatus(status)}
                >
                  <span aria-hidden="true">{active.status === status ? "✓" : "○"}</span>
                  <span>{status}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {active && moreOpen && (
        <div
          className="rm-unified-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Autres actions du devis"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <section className="rm-unified-sheet">
            <header>
              <div><small>DEVIS {active.number}</small><strong>Plus d’actions</strong></div>
              <button onClick={() => setMoreOpen(false)} aria-label="Fermer">×</button>
            </header>
            <div className="rm-unified-sheet-list">
              <button onClick={() => { setMoreOpen(false); runUnderlyingAction(active.number, /envoyer pdf/); }}>
                <span aria-hidden="true">✉</span><span>Envoyer le PDF</span>
              </button>
              <button onClick={() => { setMoreOpen(false); downloadCurrentPdf(); }}>
                <span aria-hidden="true">↓</span><span>Télécharger le PDF</span>
              </button>
              <button onClick={() => { setMoreOpen(false); runUnderlyingAction(active.number, /dupliquer/); }}>
                <span aria-hidden="true">⧉</span><span>Dupliquer le devis</span>
              </button>
              <button onClick={() => { setMoreOpen(false); runUnderlyingAction(active.number, /transformer en facture/); }}>
                <span aria-hidden="true">↻</span><span>Transformer en facture</span>
              </button>
              <button className="danger" onClick={() => { setMoreOpen(false); runUnderlyingAction(active.number, /supprimer/); }}>
                <span aria-hidden="true">⌫</span><span>Supprimer le devis</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
