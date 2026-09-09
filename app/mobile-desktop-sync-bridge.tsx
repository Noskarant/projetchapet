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
  applyWorkspaceAliases,
  coreWorkspaceSignature,
  customerInputFromMobile,
  diffById,
  emptyWorkspaceAliases,
  invoiceInputFromMobile,
  mergeInitialMobileWorkspace,
  mobileInvoiceStatusToDesktop,
  normalizedWorkspaceToMobile,
  quoteInputFromMobile,
  stableSignature,
  type WorkspaceAliases,
} from "@/lib/mobile-desktop-sync";

const LOCAL_CHECK_MS = 850;
const PULL_INTERVAL_MS = 5_000;
const FAILED_PUSH_RETRY_MS = 5_000;

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

async function synchronizeLocalChanges(
  baseline: MobileWorkspace,
  local: MobileWorkspace,
  aliases: WorkspaceAliases,
) {
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
    if (customer.id !== saved.id) aliases.customers.set(customer.id, saved.id);
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
    const customerId = customerIds.get(quote.customerId) ?? aliases.customers.get(quote.customerId) ?? quote.customerId;
    const savedId = await saveQuote(
      quoteInputFromMobile(quote, customerId, previous?.status),
      server.quotes.map((item) => item.number),
      previous?.id,
    );
    quoteIds.set(quote.id, savedId);
    if (quote.id !== savedId) aliases.quotes.set(quote.id, savedId);
  }
  for (const quote of local.quotes) {
    if (!quoteIds.has(quote.id) && server.quotes.some((item) => item.id === quote.id)) {
      quoteIds.set(quote.id, quote.id);
    }
  }

  for (const invoice of [...invoiceDiff.created, ...invoiceDiff.updated]) {
    const previous = server.invoices.find((item) => item.id === invoice.id);
    const customerId = customerIds.get(invoice.customerId) ?? aliases.customers.get(invoice.customerId) ?? invoice.customerId;
    const quoteId = invoice.sourceQuoteId
      ? quoteIds.get(invoice.sourceQuoteId) ?? aliases.quotes.get(invoice.sourceQuoteId) ?? invoice.sourceQuoteId
      : null;

    if (!previous || previous.status === "draft") {
      const savedId = await saveInvoice(
        invoiceInputFromMobile(invoice, customerId, quoteId, previous?.status),
        server.invoices.map((item) => item.number),
        previous?.id,
      );
      if (invoice.id !== savedId) aliases.invoices.set(invoice.id, savedId);
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
  const serverCanonical = normalizedWorkspaceToMobile(server, local);

  if (!hasCoreData(local)) {
    writeWorkspace(serverCanonical);
    return serverCanonical;
  }

  // Lors de la première convergence, le desktop et le mobile peuvent déjà contenir chacun
  // de vraies données. Le serveur gagne uniquement sur les mêmes UUID ; les entités locales
  // supplémentaires sont migrées au lieu d'être écrasées.
  const merged = mergeInitialMobileWorkspace(serverCanonical, local);
  if (coreWorkspaceSignature(merged) !== coreWorkspaceSignature(serverCanonical)) {
    const aliases = emptyWorkspaceAliases();
    await synchronizeLocalChanges(serverCanonical, merged, aliases);
    const migrated = await fetchWorkspace();
    const canonical = normalizedWorkspaceToMobile(migrated, applyWorkspaceAliases(merged, aliases));
    writeWorkspace(canonical);
    return canonical;
  }

  writeWorkspace(serverCanonical);
  return serverCanonical;
}

export default function MobileDesktopSyncBridge() {
  const baseline = useRef<MobileWorkspace | null>(null);
  const aliases = useRef<WorkspaceAliases>(emptyWorkspaceAliases());
  const syncing = useRef(false);
  const failedSignature = useRef("");
  const failedAt = useRef(0);
  const lastPull = useRef(0);

  useEffect(() => {
    let disposed = false;

    const initialize = () => {
      try {
        baseline.current = applyWorkspaceAliases(readWorkspace(), aliases.current);
        lastPull.current = Date.now();
      } catch (error) {
        console.error("[FORGEO] Initialisation de la synchronisation mobile impossible", error);
      }
    };

    const pullServer = async (local: MobileWorkspace) => {
      const server = await fetchWorkspace();
      const canonical = normalizedWorkspaceToMobile(server, applyWorkspaceAliases(local, aliases.current));
      if (coreWorkspaceSignature(canonical) !== coreWorkspaceSignature(local)) writeWorkspace(canonical);
      baseline.current = canonical;
      lastPull.current = Date.now();
      return canonical;
    };

    const synchronize = async () => {
      if (disposed || syncing.current || !baseline.current) return;
      const rawLocal = readWorkspace();
      const local = applyWorkspaceAliases(rawLocal, aliases.current);
      const localSignature = coreWorkspaceSignature(local);
      const baselineSignature = coreWorkspaceSignature(baseline.current);
      const localChanged = localSignature !== baselineSignature;
      const pullDue = Date.now() - lastPull.current >= PULL_INTERVAL_MS;

      if (!localChanged && !pullDue) return;
      if (
        localChanged &&
        localSignature === failedSignature.current &&
        Date.now() - failedAt.current < FAILED_PUSH_RETRY_MS
      ) return;

      syncing.current = true;
      try {
        if (localChanged) {
          // Une saisie locale non envoyée est prioritaire sur un pull serveur : si le push échoue,
          // on la laisse strictement en place et on retentera plus tard au lieu de l'écraser.
          await synchronizeLocalChanges(baseline.current, local, aliases.current);
          const server = await fetchWorkspace();
          const aliasedLocal = applyWorkspaceAliases(rawLocal, aliases.current);
          const canonical = normalizedWorkspaceToMobile(server, aliasedLocal);
          writeWorkspace(canonical);
          baseline.current = canonical;
          failedSignature.current = "";
          failedAt.current = 0;
          lastPull.current = Date.now();
          return;
        }

        await pullServer(local);
        failedSignature.current = "";
        failedAt.current = 0;
      } catch (error) {
        console.error("[FORGEO] Synchronisation mobile ↔ desktop impossible", error);
        if (localChanged) {
          failedSignature.current = localSignature;
          failedAt.current = Date.now();
          // Ne pas recharger le serveur ici : cela détruirait précisément les changements locaux
          // qui viennent d'échouer. Le prochain essai repartira de la même baseline.
        }
      } finally {
        syncing.current = false;
      }
    };

    initialize();
    const interval = window.setInterval(() => void synchronize(), LOCAL_CHECK_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
