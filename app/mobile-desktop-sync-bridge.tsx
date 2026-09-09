"use client";

import { useEffect, useRef } from "react";
import {
  deleteCustomer,
  deleteInvoice,
  deleteQuote,
  fetchWorkspace,
  markInvoicePaid,
  saveCustomer,
  saveInvoice,
  saveQuote,
  updateInvoiceStatus,
  type Invoice,
} from "@/lib/project-chapet";
import { EMPTY_MOBILE_WORKSPACE } from "@/lib/mobile-fresh-start";
import {
  MOBILE_WORKSPACE_STORAGE_KEY,
  normalizeMobileWorkspace,
} from "@/lib/mobile-workspace-storage";
import type { MobileWorkspace } from "@/lib/mobile-prototype";
import {
  coreWorkspaceSignature,
  customerInputFromMobile,
  diffById,
  invoiceInputFromMobile,
  invoiceStatusToMobile,
  mobileInvoiceStatusToDesktop,
  normalizedWorkspaceToMobile,
  quoteInputFromMobile,
  stableSignature,
} from "@/lib/mobile-desktop-sync";

const PULL_INTERVAL_MS = 5_000;
const LOCAL_CHECK_MS = 850;

function readWorkspace(): MobileWorkspace {
  try {
    const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
    return normalizeMobileWorkspace(raw ? JSON.parse(raw) : null, EMPTY_MOBILE_WORKSPACE);
  } catch {
    return EMPTY_MOBILE_WORKSPACE;
  }
}

function writeWorkspace(workspace: MobileWorkspace) {
  window.localStorage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

function hasCoreData(workspace: MobileWorkspace) {
  return Boolean(workspace.customers.length || workspace.quotes.length || workspace.invoices.length);
}

function invoiceEditableContent(invoice: MobileWorkspace["invoices"][number]) {
  return {
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    items: invoice.items,
    notes: invoice.notes,
    sourceQuoteId: invoice.sourceQuoteId ?? null,
  };
}

async function synchronizeLocalChanges(baseline: MobileWorkspace, local: MobileWorkspace) {
  const server = await fetchWorkspace();
  const customerDiff = diffById(baseline.customers, local.customers);
  const quoteDiff = diffById(baseline.quotes, local.quotes);
  const invoiceDiff = diffById(baseline.invoices, local.invoices);

  const customerIds = new Map<string, string>();
  server.customers.forEach((customer) => customerIds.set(customer.id, customer.id));

  for (const customer of [...customerDiff.created, ...customerDiff.updated]) {
    const existing = server.customers.find((item) => item.id === customer.id);
    const saved = await saveCustomer(customerInputFromMobile(customer), existing?.id);
    customerIds.set(customer.id, saved.id);
  }
  for (const customer of local.customers) {
    if (!customerIds.has(customer.id) && server.customers.some((item) => item.id === customer.id)) {
      customerIds.set(customer.id, customer.id);
    }
  }

  const quoteIds = new Map<string, string>();
  server.quotes.forEach((quote) => quoteIds.set(quote.id, quote.id));
  for (const quote of [...quoteDiff.created, ...quoteDiff.updated]) {
    const previous = server.quotes.find((item) => item.id === quote.id);
    const customerId = customerIds.get(quote.customerId) ?? quote.customerId;
    const savedId = await saveQuote(
      quoteInputFromMobile(quote, customerId, previous?.status),
      server.quotes.map((item) => item.number),
      previous?.id,
    );
    quoteIds.set(quote.id, savedId);
  }
  for (const quote of local.quotes) {
    if (!quoteIds.has(quote.id) && server.quotes.some((item) => item.id === quote.id)) {
      quoteIds.set(quote.id, quote.id);
    }
  }

  for (const invoice of [...invoiceDiff.created, ...invoiceDiff.updated]) {
    const previous = server.invoices.find((item) => item.id === invoice.id);
    const customerId = customerIds.get(invoice.customerId) ?? invoice.customerId;
    const quoteId = invoice.sourceQuoteId ? quoteIds.get(invoice.sourceQuoteId) ?? invoice.sourceQuoteId : null;

    if (!previous || previous.status === "draft") {
      await saveInvoice(
        invoiceInputFromMobile(invoice, customerId, quoteId, previous?.status),
        server.invoices.map((item) => item.number),
        previous?.id,
      );
      continue;
    }

    const baselineInvoice = baseline.invoices.find((item) => item.id === invoice.id);
    const contentChanged = baselineInvoice
      ? stableSignature(invoiceEditableContent(invoice)) !== stableSignature(invoiceEditableContent(baselineInvoice))
      : false;
    if (contentChanged) {
      throw new Error(`La facture ${previous.number} est déjà émise et ne peut plus être modifiée.`);
    }

    const desiredStatus = mobileInvoiceStatusToDesktop(invoice.status, previous.status);
    if (desiredStatus === "paid" && previous.status !== "paid") {
      await markInvoicePaid(previous as Invoice);
    } else if (desiredStatus !== previous.status) {
      await updateInvoiceStatus(previous.id, desiredStatus);
    }
  }

  for (const invoice of invoiceDiff.deleted) {
    if (server.invoices.some((item) => item.id === invoice.id)) await deleteInvoice(invoice.id);
  }
  for (const quote of quoteDiff.deleted) {
    if (server.quotes.some((item) => item.id === quote.id)) await deleteQuote(quote.id);
  }
  for (const customer of customerDiff.deleted) {
    if (server.customers.some((item) => item.id === customer.id)) await deleteCustomer(customer.id);
  }
}

export async function hydrateMobileCoreFromDesktop() {
  const local = readWorkspace();
  const server = await fetchWorkspace();

  if (!server.customers.length && !server.quotes.length && !server.invoices.length && hasCoreData(local)) {
    await synchronizeLocalChanges(EMPTY_MOBILE_WORKSPACE, local);
    const migrated = await fetchWorkspace();
    const canonical = normalizedWorkspaceToMobile(migrated, local);
    writeWorkspace(canonical);
    return canonical;
  }

  const canonical = normalizedWorkspaceToMobile(server, local);
  writeWorkspace(canonical);
  return canonical;
}

export default function MobileDesktopSyncBridge() {
  const baseline = useRef<MobileWorkspace | null>(null);
  const syncing = useRef(false);
  const lastPull = useRef(0);

  useEffect(() => {
    let disposed = false;

    const initialize = async () => {
      try {
        const current = readWorkspace();
        baseline.current = current;
        lastPull.current = Date.now();
      } catch (error) {
        console.error("[FORGEO] Initialisation de la synchronisation mobile impossible", error);
      }
    };

    const synchronize = async () => {
      if (disposed || syncing.current || !baseline.current) return;
      const local = readWorkspace();
      const localChanged = coreWorkspaceSignature(local) !== coreWorkspaceSignature(baseline.current);

      syncing.current = true;
      try {
        if (localChanged) {
          await synchronizeLocalChanges(baseline.current, local);
          const server = await fetchWorkspace();
          const canonical = normalizedWorkspaceToMobile(server, local);
          writeWorkspace(canonical);
          baseline.current = canonical;
          lastPull.current = Date.now();
          return;
        }

        if (Date.now() - lastPull.current >= PULL_INTERVAL_MS) {
          const server = await fetchWorkspace();
          const canonical = normalizedWorkspaceToMobile(server, local);
          if (coreWorkspaceSignature(canonical) !== coreWorkspaceSignature(local)) {
            writeWorkspace(canonical);
            baseline.current = canonical;
            // Le shell mobile relira automatiquement ces données au prochain chargement.
            // Aucun rechargement forcé n'est déclenché afin de ne jamais interrompre une saisie.
          }
          lastPull.current = Date.now();
        }
      } catch (error) {
        console.error("[FORGEO] Synchronisation mobile ↔ desktop impossible", error);
        try {
          const server = await fetchWorkspace();
          const canonical = normalizedWorkspaceToMobile(server, local);
          writeWorkspace(canonical);
          baseline.current = canonical;
        } catch (reloadError) {
          console.error("[FORGEO] Récupération après erreur de synchronisation impossible", reloadError);
        }
      } finally {
        syncing.current = false;
      }
    };

    void initialize();
    const interval = window.setInterval(() => void synchronize(), LOCAL_CHECK_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
