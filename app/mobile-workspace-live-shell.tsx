"use client";

import { useEffect, useRef, useState } from "react";
import { EMPTY_MOBILE_WORKSPACE } from "@/lib/mobile-fresh-start";
import {
  MOBILE_WORKSPACE_STORAGE_KEY,
  normalizeMobileWorkspace,
} from "@/lib/mobile-workspace-storage";
import type { MobileInvoice, MobileWorkspace } from "@/lib/mobile-prototype";
import RappidosMobileShellV2 from "./rappidos-mobile-shell-v2";

type RestoreTarget = {
  tab: string;
  invoiceNumber?: string;
  actionLabel?: string;
};

const POLL_MS = 180;
const CANONICAL_WAIT_MS = 8_000;

function readWorkspace(): MobileWorkspace {
  try {
    const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
    return normalizeMobileWorkspace(raw ? JSON.parse(raw) : null, EMPTY_MOBILE_WORKSPACE);
  } catch {
    return EMPTY_MOBILE_WORKSPACE;
  }
}

function sameInvoiceIdentity(left: MobileInvoice, right: MobileInvoice) {
  if (left.sourceQuoteId && right.sourceQuoteId && left.sourceQuoteId === right.sourceQuoteId) return true;
  return left.customerId === right.customerId
    && left.issueDate === right.issueDate
    && left.title === right.title
    && Math.abs(left.total - right.total) < 0.01;
}

export function findCanonicalInvoice(
  previous: MobileWorkspace,
  current: MobileWorkspace,
  displayedNumber: string,
) {
  const exact = current.invoices.find((invoice) => invoice.number === displayedNumber);
  if (exact) return exact;

  const previousInvoice = previous.invoices.find((invoice) => invoice.number === displayedNumber);
  if (previousInvoice) {
    const byIdentity = current.invoices.find((invoice) => sameInvoiceIdentity(previousInvoice, invoice));
    if (byIdentity) return byIdentity;
  }

  const legacy = /^F-(\d{4}-\d+)$/i.exec(displayedNumber);
  if (legacy) {
    return current.invoices.find((invoice) => invoice.number === `FAC-${legacy[1]}`) ?? null;
  }

  return null;
}

function activeTabLabel() {
  return document.querySelector<HTMLElement>(".rm-bottom-nav button.active span")?.textContent?.trim() || "Devis";
}

function openInvoiceNumber() {
  const sheets = Array.from(document.querySelectorAll<HTMLElement>(".rm-detail-sheet"));
  const invoiceSheet = sheets.find((sheet) =>
    sheet.querySelector("header small")?.textContent?.trim().toUpperCase() === "FACTURE",
  );
  return invoiceSheet?.querySelector("header h2")?.textContent?.trim() || "";
}

function invoiceCardNumbers() {
  return Array.from(document.querySelectorAll<HTMLElement>(".rm-document-card .rm-document-main small"))
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);
}

function clickTab(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button"))
    .find((candidate) => candidate.querySelector("span")?.textContent?.trim() === label);
  button?.click();
}

function clickInvoice(number: string) {
  const card = Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-document-card"))
    .find((candidate) => candidate.querySelector(".rm-document-main small")?.textContent?.trim() === number);
  card?.click();
}

function showSyncError() {
  const existing = document.querySelector<HTMLElement>("[data-mobile-invoice-sync-error]");
  existing?.remove();
  const toast = document.createElement("div");
  toast.className = "rm-toast";
  toast.dataset.mobileInvoiceSyncError = "true";
  toast.textContent = "La facture est créée, mais sa synchronisation n’est pas encore terminée. Réessayez dans quelques secondes.";
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4_500);
}

export default function MobileWorkspaceLiveShell() {
  const [revision, setRevision] = useState(0);
  const previousWorkspace = useRef<MobileWorkspace | null>(null);
  const restore = useRef<RestoreTarget | null>(null);
  const remounting = useRef(false);

  useEffect(() => {
    previousWorkspace.current = readWorkspace();

    const requestRemount = (target: RestoreTarget) => {
      if (remounting.current) return;
      restore.current = target;
      remounting.current = true;
      setRevision((current) => current + 1);
    };

    const inspect = () => {
      if (remounting.current) return;
      const current = readWorkspace();
      const previous = previousWorkspace.current ?? current;
      const tab = activeTabLabel();
      const detailNumber = openInvoiceNumber();

      if (detailNumber) {
        const canonical = findCanonicalInvoice(previous, current, detailNumber);
        if (canonical && canonical.number !== detailNumber) {
          previousWorkspace.current = current;
          requestRemount({ tab: "Factures", invoiceNumber: canonical.number });
          return;
        }
      }

      if (tab === "Factures") {
        const search = document.querySelector<HTMLInputElement>(".rm-search input")?.value.trim() || "";
        const activeFilter = document.querySelector<HTMLElement>(".rm-segmented button.active")?.textContent?.trim() || "Toutes";
        if (!search && activeFilter === "Toutes") {
          const rendered = invoiceCardNumbers().sort().join("|");
          const stored = current.invoices.map((invoice) => invoice.number).sort().join("|");
          if (rendered !== stored) {
            previousWorkspace.current = current;
            requestRemount({ tab: "Factures" });
            return;
          }
        }
      }

      previousWorkspace.current = current;
    };

    const interval = window.setInterval(inspect, POLL_MS);

    const guardInvoiceAction = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const label = button.textContent?.trim() || "";
      if (!/^(Envoyer PDF|Envoyer comptable)$/i.test(label)) return;

      const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (sheet?.querySelector("header small")?.textContent?.trim().toUpperCase() !== "FACTURE") return;
      const displayedNumber = sheet.querySelector("header h2")?.textContent?.trim() || "";
      if (!displayedNumber) return;

      const current = readWorkspace();
      const currentInvoice = current.invoices.find((invoice) => invoice.number === displayedNumber);
      const alreadyCanonical = currentInvoice && /^FAC-/i.test(currentInvoice.number);
      if (alreadyCanonical) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const previous = previousWorkspace.current ?? current;
      const source = currentInvoice
        ?? previous.invoices.find((invoice) => invoice.number === displayedNumber)
        ?? null;
      const startedAt = Date.now();

      const wait = () => {
        const latest = readWorkspace();
        const canonical = source
          ? latest.invoices.find((invoice) => /^FAC-/i.test(invoice.number) && sameInvoiceIdentity(source, invoice))
          : findCanonicalInvoice(previous, latest, displayedNumber);

        if (canonical) {
          previousWorkspace.current = latest;
          requestRemount({ tab: "Factures", invoiceNumber: canonical.number, actionLabel: label });
          return;
        }
        if (Date.now() - startedAt >= CANONICAL_WAIT_MS) {
          showSyncError();
          return;
        }
        window.setTimeout(wait, POLL_MS);
      };

      wait();
    };

    document.addEventListener("click", guardInvoiceAction, true);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", guardInvoiceAction, true);
    };
  }, []);

  useEffect(() => {
    if (!remounting.current) return;
    const target = restore.current;
    if (!target) {
      remounting.current = false;
      return;
    }

    let attempts = 0;
    const restoreUi = () => {
      attempts += 1;
      clickTab(target.tab);

      if (target.invoiceNumber) {
        window.setTimeout(() => {
          clickInvoice(target.invoiceNumber as string);
          if (target.actionLabel) {
            window.setTimeout(() => {
              const sheets = Array.from(document.querySelectorAll<HTMLElement>(".rm-detail-sheet"));
              const sheet = sheets.find((candidate) =>
                candidate.querySelector("header h2")?.textContent?.trim() === target.invoiceNumber,
              );
              const action = Array.from(sheet?.querySelectorAll<HTMLButtonElement>("button") || [])
                .find((candidate) => candidate.textContent?.trim() === target.actionLabel);
              action?.click();
            }, 80);
          }
        }, 70);
      }

      if (document.querySelector(".rm-bottom-nav")) {
        restore.current = null;
        remounting.current = false;
        previousWorkspace.current = readWorkspace();
        return;
      }
      if (attempts < 20) window.setTimeout(restoreUi, 50);
      else remounting.current = false;
    };

    window.setTimeout(restoreUi, 0);
  }, [revision]);

  return <RappidosMobileShellV2 key={revision} />;
}
