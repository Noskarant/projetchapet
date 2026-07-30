"use client";

import { useEffect } from "react";

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");

function readText(root: ParentNode, selector: string, fallback = "") {
  return root.querySelector(selector)?.textContent?.trim() || fallback;
}

function findAction(detail: HTMLElement, label: string) {
  const wanted = normalize(label);
  return Array.from(detail.querySelectorAll<HTMLButtonElement>(".rm-detail-actions button")).find(
    (button) => normalize(button.textContent || "").includes(wanted),
  );
}

async function waitForDetail() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2600) {
    const detail = document.querySelector<HTMLElement>(".rm-detail-sheet");
    if (detail) return detail;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return null;
}

async function openPdfFromCard() {
  const detail = await waitForDetail();
  const previewButton = detail
    ? Array.from(detail.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        normalize(button.textContent || "").includes("aperçu pdf"),
      )
    : null;
  previewButton?.click();
}

function makeProxyButton(
  label: string,
  action: HTMLButtonElement,
  closePreview: HTMLButtonElement,
  className = "",
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", () => {
    closePreview.click();
    window.setTimeout(() => action.click(), 100);
  });
  return button;
}

function enhancePreview(preview: HTMLElement) {
  if (preview.dataset.mobileDocumentFocus === "true") return;
  const detail = document.querySelector<HTMLElement>(".rm-detail-sheet");
  const header = preview.querySelector<HTMLElement>(":scope > header");
  const iframe = preview.querySelector<HTMLIFrameElement>(":scope > iframe");
  const utilityFooter = preview.querySelector<HTMLElement>(":scope > footer");
  const closePreview = header?.querySelector<HTMLButtonElement>("button");
  if (!detail || !header || !iframe || !utilityFooter || !closePreview) return;

  preview.dataset.mobileDocumentFocus = "true";
  preview.classList.add("rm-document-focus");

  const type = readText(detail, "header small", "DOCUMENT").toUpperCase();
  const number = readText(detail, "header h2", "Document");
  const client = readText(detail, ".rm-detail-client strong", "Client");
  const amount = readText(detail, ".rm-detail-amount strong", "0,00 €");
  const title = readText(detail, ".rm-detail-amount > span:not(.rm-status)");
  const firstDateLabel = readText(detail, ".rm-detail-dates > div:first-child span", "Émis le");
  const firstDate = readText(detail, ".rm-detail-dates > div:first-child strong", "—");
  const secondDateLabel = readText(detail, ".rm-detail-dates > div:last-child span", "Échéance");
  const secondDate = readText(detail, ".rm-detail-dates > div:last-child strong", "—");
  const status =
    readText(detail, ".rm-status-editor button.active") ||
    readText(detail, ".rm-detail-amount .rm-status") ||
    (type === "FACTURE" ? "En cours" : "En attente");

  closePreview.classList.add("rm-focus-close");
  closePreview.setAttribute("aria-label", "Fermer l’aperçu");
  header.insertBefore(closePreview, header.firstChild);

  const titleBlock = header.querySelector<HTMLElement>("div");
  if (titleBlock) {
    titleBlock.querySelector("small")!.textContent = type;
    titleBlock.querySelector("h2")!.textContent = number;
  }

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "rm-focus-menu-button";
  menuButton.setAttribute("aria-label", "Toutes les actions");
  menuButton.textContent = "⋮";
  header.append(menuButton);

  const summary = document.createElement("section");
  summary.className = "rm-focus-summary";

  const amountRow = document.createElement("div");
  amountRow.className = "rm-focus-amount";
  const amountStrong = document.createElement("strong");
  amountStrong.textContent = amount;
  const statusPill = document.createElement("span");
  statusPill.textContent = status;
  amountRow.append(amountStrong, statusPill);

  const dates = document.createElement("div");
  dates.className = "rm-focus-dates";
  for (const [label, value] of [
    [firstDateLabel, firstDate],
    [secondDateLabel, secondDate],
  ]) {
    const block = document.createElement("div");
    const small = document.createElement("small");
    const strong = document.createElement("strong");
    small.textContent = label;
    strong.textContent = value;
    block.append(small, strong);
    dates.append(block);
  }

  const clientCard = document.createElement("div");
  clientCard.className = "rm-focus-client";
  const clientStrong = document.createElement("strong");
  const clientSmall = document.createElement("small");
  clientStrong.textContent = client;
  clientSmall.textContent = title || (type === "FACTURE" ? "Facture client" : "Devis client");
  clientCard.append(clientStrong, clientSmall);

  summary.append(amountRow, dates, clientCard);
  header.insertAdjacentElement("afterend", summary);

  if (!iframe.src.includes("#")) iframe.src = `${iframe.src}#toolbar=0&navpanes=0&view=FitH`;

  const primaryBar = document.createElement("div");
  primaryBar.className = "rm-focus-primary-actions";
  const isInvoice = type.includes("FACTURE") || type.includes("AVOIR");
  const primaryDefinitions = isInvoice
    ? [
        ["Indiquer comme payée", "marquer payée", "primary"],
        ["Envoyer la facture", "envoyer pdf", "secondary"],
      ]
    : [
        ["Envoyer le devis", "envoyer pdf", "primary"],
        ["Transformer en facture", "transformer en facture", "secondary"],
      ];

  const primaryActions = new Set<HTMLButtonElement>();
  for (const [label, lookup, kind] of primaryDefinitions) {
    const action = findAction(detail, lookup);
    if (!action) continue;
    primaryActions.add(action);
    primaryBar.append(makeProxyButton(label, action, closePreview, `rm-focus-${kind}`));
  }
  utilityFooter.insertAdjacentElement("beforebegin", primaryBar);

  const menu = document.createElement("div");
  menu.className = "rm-focus-action-menu";
  const menuTitle = document.createElement("strong");
  menuTitle.textContent = "Toutes les actions";
  menu.append(menuTitle);

  const actions = Array.from(detail.querySelectorAll<HTMLButtonElement>(".rm-detail-actions button"));
  for (const action of actions) {
    const label = action.textContent?.trim() || "Action";
    if (normalize(label).includes("aperçu pdf") || primaryActions.has(action)) continue;
    const className = action.classList.contains("danger") ? "danger" : "";
    menu.append(makeProxyButton(label, action, closePreview, className));
  }
  preview.append(menu);

  menuButton.addEventListener("click", () => menu.classList.toggle("open"));
  menu.addEventListener("click", (event) => {
    if (event.target === menu) menu.classList.remove("open");
  });
}

export default function MobileAutoPdfPreview() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    let cardSequence = 0;
    const onCardClick = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLButtonElement>(".rm-document-card");
      if (!card) return;
      const current = ++cardSequence;
      window.setTimeout(async () => {
        if (current !== cardSequence) return;
        await openPdfFromCard();
      }, 0);
    };

    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>(".rm-v2-pdf").forEach(enhancePreview);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll<HTMLElement>(".rm-v2-pdf").forEach(enhancePreview);
    document.addEventListener("click", onCardClick);

    return () => {
      cardSequence += 1;
      observer.disconnect();
      document.removeEventListener("click", onCardClick);
    };
  }, []);

  return null;
}
