"use client";

import { useEffect, useState } from "react";

const OPEN_MENU_EVENT = "projetchapet:open-quote-actions";
const RUN_ACTION_EVENT = "projetchapet:run-quote-action";

type QuoteAction =
  | "send"
  | "primary-status"
  | "edit"
  | "voice"
  | "status"
  | "cancel"
  | "duplicate"
  | "pdf"
  | "share"
  | "download"
  | "print"
  | "invoice"
  | "delete";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function currentPreview() {
  return document.querySelector<HTMLElement>(
    ".rm-philippe-preview[data-unified-quote-sheet='true']",
  );
}

function currentQuoteNumber(preview: HTMLElement) {
  return (
    preview.dataset.quoteNumber ||
    preview.querySelector(".rm-philippe-preview-header h2")?.textContent ||
    ""
  ).trim();
}

function clickUnifiedAction(action: "edit" | "voice" | "status" | "more") {
  document
    .querySelector<HTMLButtonElement>(`[data-unified-quote-action='${action}']`)
    ?.click();
}

function clickDialogButton(
  dialogLabel: string,
  buttonPattern: RegExp,
  attempts = 20,
) {
  const dialog = Array.from(
    document.querySelectorAll<HTMLElement>("[role='dialog'][aria-label]"),
  ).find((element) => element.getAttribute("aria-label") === dialogLabel);
  const button = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") || []).find(
    (candidate) => buttonPattern.test(normalize(candidate.textContent || "")),
  );

  if (button) {
    button.click();
    return;
  }

  if (attempts > 0) {
    window.setTimeout(
      () => clickDialogButton(dialogLabel, buttonPattern, attempts - 1),
      50,
    );
  }
}

function runMoreAction(pattern: RegExp) {
  clickUnifiedAction("more");
  window.setTimeout(
    () => clickDialogButton("Autres actions du devis", pattern),
    20,
  );
}

function runStatusAction(status: string) {
  clickUnifiedAction("status");
  window.setTimeout(
    () =>
      clickDialogButton(
        "Changer le statut du devis",
        new RegExp(`^${normalize(status)}$`),
      ),
    20,
  );
}

function switchToPdf() {
  const preview = currentPreview();
  const pdf = Array.from(
    preview?.querySelectorAll<HTMLButtonElement>(".rm-philippe-preview-tabs button") || [],
  ).find((button) => normalize(button.getAttribute("aria-label") || button.textContent || "") === "pdf");
  pdf?.click();
}

function dispatchAction(action: QuoteAction) {
  window.dispatchEvent(
    new CustomEvent<QuoteAction>(RUN_ACTION_EVENT, { detail: action }),
  );
}

function createPrimaryButton(
  action: QuoteAction,
  className: string,
  label: string,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.philippePrimaryAction = action;
  button.dataset.unifiedQuoteAction = `philippe-${action}`;
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dispatchAction(action);
  });
  return button;
}

function syncPrimaryStatusButton(preview: HTMLElement, button: HTMLButtonElement) {
  const status = preview.querySelector<HTMLButtonElement>("[data-unified-status]")?.dataset.status || "";
  let label = "Changer le statut";

  if (status === "en-attente") label = "Indiquer comme validé";
  if (status === "valide") label = "Transformer en facture";

  if (button.textContent !== label) button.textContent = label;
  button.setAttribute("aria-label", label);
  button.dataset.mode = status;
}

export default function MobilePhilippeQuoteActionsMenu() {
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setMenuOpen(true);
    const onRun = (event: Event) => {
      const action = (event as CustomEvent<QuoteAction>).detail;
      setMenuOpen(false);

      switch (action) {
        case "send":
        case "share":
          runMoreAction(/^envoyer le pdf$/);
          return;
        case "primary-status": {
          const status = currentPreview()
            ?.querySelector<HTMLButtonElement>("[data-unified-status]")
            ?.dataset.status;
          if (status === "en-attente") {
            runStatusAction("Validé");
            return;
          }
          if (status === "valide") {
            runMoreAction(/^transformer en facture$/);
            return;
          }
          clickUnifiedAction("status");
          return;
        }
        case "edit":
          clickUnifiedAction("edit");
          return;
        case "voice":
          clickUnifiedAction("voice");
          return;
        case "status":
          clickUnifiedAction("status");
          return;
        case "cancel":
          runStatusAction("Refusé");
          return;
        case "duplicate":
          runMoreAction(/^dupliquer le devis$/);
          return;
        case "pdf":
          switchToPdf();
          return;
        case "download":
          runMoreAction(/^telecharger le pdf$/);
          return;
        case "print":
          switchToPdf();
          window.setTimeout(() => window.print(), 180);
          return;
        case "invoice":
          runMoreAction(/^transformer en facture$/);
          return;
        case "delete":
          runMoreAction(/^supprimer le devis$/);
          return;
      }
    };

    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    window.addEventListener(RUN_ACTION_EVENT, onRun);
    return () => {
      window.removeEventListener(OPEN_MENU_EVENT, onOpen);
      window.removeEventListener(RUN_ACTION_EVENT, onRun);
    };
  }, []);

  useEffect(() => {
    const clear = () => {
      document.body.classList.remove("rm-philippe-quote-actions-enabled");
      setActiveNumber(null);
      setMenuOpen(false);
    };

    const enhance = () => {
      const preview = currentPreview();
      if (!preview) {
        if (document.body.classList.contains("rm-philippe-quote-actions-enabled")) clear();
        return;
      }

      const number = currentQuoteNumber(preview);
      if (!number) return;

      document.body.classList.add("rm-philippe-quote-actions-enabled");
      setActiveNumber((current) => (current === number ? current : number));

      const header = preview.querySelector<HTMLElement>(".rm-philippe-preview-header");
      if (header && !header.querySelector("[data-philippe-actions-trigger]")) {
        const originalClose = header.querySelector<HTMLButtonElement>(":scope > button:last-child");
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "rm-philippe-actions-trigger";
        trigger.dataset.philippeActionsTrigger = "true";
        trigger.setAttribute("aria-label", "Actions du devis");
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.textContent = "⋮";
        trigger.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(new Event(OPEN_MENU_EVENT));
        });
        header.insertBefore(trigger, originalClose || null);
      }

      const footer = preview.querySelector<HTMLElement>(".rm-philippe-preview-actions");
      if (!footer) return;

      let send = footer.querySelector<HTMLButtonElement>(
        "[data-philippe-primary-action='send']",
      );
      if (!send) {
        send = createPrimaryButton(
          "send",
          "rm-philippe-primary-action rm-philippe-primary-send",
          "Envoyer le devis",
        );
        footer.append(send);
      }

      let status = footer.querySelector<HTMLButtonElement>(
        "[data-philippe-primary-action='primary-status']",
      );
      if (!status) {
        status = createPrimaryButton(
          "primary-status",
          "rm-philippe-primary-action rm-philippe-primary-status",
          "Changer le statut",
        );
        footer.append(status);
      }
      syncPrimaryStatusButton(preview, status);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-status"],
    });
    const interval = window.setInterval(enhance, 220);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.body.classList.remove("rm-philippe-quote-actions-enabled");
    };
  }, []);

  const run = (action: QuoteAction) => dispatchAction(action);

  return (
    <>
      <style>{`
        @media (max-width: 820px) {
          body.rm-philippe-quote-actions-enabled .rm-philippe-preview-header {
            position: relative;
          }
          .rm-philippe-actions-trigger {
            position: absolute;
            top: 50%;
            right: 0;
            z-index: 5;
            display: grid !important;
            width: 42px;
            height: 42px;
            place-items: center;
            transform: translateY(-50%);
            border: 1px solid rgba(255,255,255,.14) !important;
            border-radius: 50% !important;
            background: rgba(255,255,255,.08) !important;
            color: #fff !important;
            font-size: 25px !important;
            font-weight: 900;
            line-height: 1;
          }
          body.rm-philippe-quote-actions-enabled .rm-philippe-preview-actions {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          body.rm-philippe-quote-actions-enabled .rm-philippe-preview-actions > :not([data-philippe-primary-action]) {
            display: none !important;
          }
          .rm-philippe-primary-action {
            display: grid !important;
            width: 100%;
            min-height: 52px !important;
            place-items: center;
            padding: 11px 16px !important;
            border-radius: 14px !important;
            font-size: 14px !important;
            font-weight: 900 !important;
          }
          .rm-philippe-primary-send {
            border: 0 !important;
            background: linear-gradient(100deg, #6f20ff, #ff3e75 58%, #ff7b3d) !important;
            color: #fff !important;
            box-shadow: 0 10px 24px rgba(121, 40, 255, .28);
          }
          .rm-philippe-primary-status {
            border: 1px solid transparent !important;
            background:
              linear-gradient(#10182b, #10182b) padding-box,
              linear-gradient(100deg, #7437ff, #ff4f7c, #ff7b42) border-box !important;
            color: #fff !important;
          }
          .rm-philippe-actions-backdrop {
            position: fixed;
            inset: 0;
            z-index: 9400;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding: 14px 12px max(14px, env(safe-area-inset-bottom));
            background: rgba(1, 6, 18, .66);
            backdrop-filter: blur(8px);
          }
          .rm-philippe-actions-panel {
            width: min(100%, 640px);
            max-height: min(82dvh, 760px);
            overflow-y: auto;
            padding: 14px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 24px;
            background: rgba(9, 15, 31, .98);
            box-shadow: 0 -24px 70px rgba(0, 0, 0, .45);
          }
          .rm-philippe-actions-panel header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
            padding: 2px 2px 4px;
            color: #fff;
          }
          .rm-philippe-actions-panel header div {
            display: grid;
            gap: 2px;
          }
          .rm-philippe-actions-panel header small {
            color: #9eabc1;
            font-size: 9px;
            font-weight: 850;
            letter-spacing: .11em;
          }
          .rm-philippe-actions-panel header strong {
            font-size: 18px;
          }
          .rm-philippe-actions-panel header button {
            display: grid;
            width: 38px;
            height: 38px;
            place-items: center;
            border: 0;
            border-radius: 12px;
            background: rgba(255,255,255,.09);
            color: #fff;
            font-size: 22px;
          }
          .rm-philippe-actions-list {
            display: grid;
            gap: 9px;
          }
          .rm-philippe-actions-list button {
            display: grid;
            grid-template-columns: 34px 1fr;
            gap: 10px;
            align-items: center;
            min-height: 50px;
            padding: 10px 14px;
            border: 1px solid transparent;
            border-radius: 14px;
            background:
              linear-gradient(#10182b, #10182b) padding-box,
              linear-gradient(100deg, #7338ff, #e348ff 46%, #ff7448) border-box;
            color: #fff;
            text-align: left;
            font-size: 13px;
            font-weight: 850;
          }
          .rm-philippe-actions-list button span:first-child {
            display: grid;
            width: 32px;
            height: 32px;
            place-items: center;
            border-radius: 10px;
            background: rgba(255,255,255,.08);
            font-size: 16px;
          }
          .rm-philippe-actions-list button.danger {
            color: #ffb3bd;
          }
        }
      `}</style>

      {activeNumber && menuOpen && (
        <div
          className="rm-philippe-actions-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Actions du devis"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMenuOpen(false);
          }}
        >
          <section className="rm-philippe-actions-panel">
            <header>
              <div>
                <small>DEVIS {activeNumber}</small>
                <strong>Que souhaitez-vous faire ?</strong>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">×</button>
            </header>
            <div className="rm-philippe-actions-list">
              <button className="danger" onClick={() => run("delete")}>
                <span aria-hidden="true">⌫</span><span>Supprimer le devis</span>
              </button>
              <button onClick={() => run("cancel")}>
                <span aria-hidden="true">×</span><span>Annuler le devis</span>
              </button>
              <button onClick={() => run("edit")}>
                <span aria-hidden="true">✎</span><span>Modifier le devis</span>
              </button>
              <button onClick={() => run("voice")}>
                <span aria-hidden="true">●</span><span>Modifier à la voix</span>
              </button>
              <button onClick={() => run("status")}>
                <span aria-hidden="true">✓</span><span>Changer le statut</span>
              </button>
              <button onClick={() => run("duplicate")}>
                <span aria-hidden="true">⧉</span><span>Dupliquer le devis</span>
              </button>
              <button onClick={() => run("pdf")}>
                <span aria-hidden="true">◉</span><span>Ouvrir le PDF</span>
              </button>
              <button onClick={() => run("share")}>
                <span aria-hidden="true">↗</span><span>Partager le devis</span>
              </button>
              <button onClick={() => run("download")}>
                <span aria-hidden="true">↓</span><span>Télécharger le PDF</span>
              </button>
              <button onClick={() => run("print")}>
                <span aria-hidden="true">▣</span><span>Imprimer le devis</span>
              </button>
              <button onClick={() => run("invoice")}>
                <span aria-hidden="true">↻</span><span>Transformer en facture</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
