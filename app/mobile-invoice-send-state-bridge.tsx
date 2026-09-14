"use client";

import { useEffect } from "react";
import { invoiceDeliveryLabel } from "@/lib/mobile-invoice-delivery";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import type { MobileWorkspace } from "@/lib/mobile-prototype";
import { supabase } from "@/lib/supabase";

const successPrefix = "Document envoyé à";
const databaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadWorkspace() {
  try {
    const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as MobileWorkspace : null;
  } catch {
    return null;
  }
}

function persistLocalClientSend(number: string) {
  const workspace = loadWorkspace();
  if (!workspace) return;
  const invoices = workspace.invoices.map((invoice) => invoice.number === number
    ? { ...invoice, status: invoice.status === "Brouillon" ? "En cours" as const : invoice.status }
    : invoice);
  window.localStorage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify({ ...workspace, invoices }));
}

function invoiceSheet(number: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".rm-detail-sheet")).find((sheet) =>
    sheet.querySelector("header small")?.textContent?.trim().toUpperCase() === "FACTURE"
    && sheet.querySelector("header h2")?.textContent?.trim() === number,
  ) ?? null;
}

function setDeliveryState(sheet: HTMLElement, clientSent: boolean, accountantSent: boolean) {
  const state = sheet.querySelector<HTMLElement>(".rm-accountant-state strong");
  const detail = sheet.querySelector<HTMLElement>(".rm-accountant-state small");
  const label = invoiceDeliveryLabel(clientSent, accountantSent);
  if (state && state.textContent !== label) state.textContent = label;
  if (detail && detail.textContent !== "Suivi des envois e-mail") detail.textContent = "Suivi des envois e-mail";
}

function markVisibleInvoiceSent(sheet: HTMLElement) {
  const status = sheet.querySelector<HTMLElement>(".rm-status");
  if (!status || !/brouillon/i.test(status.textContent ?? "")) return;
  status.textContent = "En cours";
  status.classList.remove("rm-status-brouillon");
  status.classList.add("rm-status-en-cours");
}

async function serverClientSent(number: string, invoiceId?: string) {
  let query = supabase.from("invoices").select("sent_at");
  query = invoiceId && databaseIdPattern.test(invoiceId)
    ? query.eq("id", invoiceId)
    : query.eq("number", number);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return false;
  return Boolean(data?.sent_at);
}

async function persistServerClientSend(number: string) {
  const workspace = loadWorkspace();
  const invoice = workspace?.invoices.find((item) => item.number === number);
  if (!invoice) return;

  let query = supabase.from("invoices").select("id, status");
  query = databaseIdPattern.test(invoice.id)
    ? query.eq("id", invoice.id)
    : query.eq("number", number);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data) return;

  const sentAt = new Date().toISOString();
  const update: { sent_at: string; status?: string } = { sent_at: sentAt };
  if (data.status === "draft" || data.status === "issued") update.status = "sent";
  const { error: updateError } = await supabase.from("invoices").update(update).eq("id", data.id);
  if (updateError) console.error("[MANUFEO] Impossible d’enregistrer l’envoi client", updateError);
}

export default function MobileInvoiceSendStateBridge() {
  useEffect(() => {
    let pendingInvoiceNumber = "";
    let refreshFrame = 0;
    const cache = new Map<string, { sent: boolean; checkedAt: number }>();

    const refreshSheet = async (sheet: HTMLElement) => {
      const number = sheet.querySelector("header h2")?.textContent?.trim() || "";
      if (!number) return;
      const workspace = loadWorkspace();
      const invoice = workspace?.invoices.find((item) => item.number === number);
      if (!invoice) return;

      const cached = cache.get(number);
      let clientSent = cached?.sent ?? false;
      if (!cached || Date.now() - cached.checkedAt > 4_000) {
        clientSent = await serverClientSent(number, invoice.id);
        cache.set(number, { sent: clientSent, checkedAt: Date.now() });
      }
      setDeliveryState(sheet, clientSent, Boolean(invoice.accountantSent));
      if (clientSent) markVisibleInvoiceSent(sheet);
    };

    const refresh = () => {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => {
        for (const sheet of Array.from(document.querySelectorAll<HTMLElement>(".rm-detail-sheet"))) {
          if (sheet.querySelector("header small")?.textContent?.trim().toUpperCase() === "FACTURE") {
            void refreshSheet(sheet);
          }
        }

        if (!pendingInvoiceNumber) return;
        const toast = Array.from(document.querySelectorAll<HTMLElement>(".rm-toast")).at(-1);
        const message = toast?.textContent?.trim() || "";
        if (message.includes(successPrefix)) {
          const number = pendingInvoiceNumber;
          pendingInvoiceNumber = "";
          persistLocalClientSend(number);
          cache.set(number, { sent: true, checkedAt: Date.now() });
          const sheet = invoiceSheet(number);
          const workspace = loadWorkspace();
          const accountantSent = Boolean(workspace?.invoices.find((item) => item.number === number)?.accountantSent);
          if (sheet) {
            setDeliveryState(sheet, true, accountantSent);
            markVisibleInvoiceSent(sheet);
          }
          void persistServerClientSend(number);
          return;
        }
        if (/envoi impossible|application mail ouverte|pdf téléchargé/i.test(message)) pendingInvoiceNumber = "";
      });
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".rm-v2-email .rm-save-button");
      if (!button) return;
      const modal = button.closest<HTMLElement>(".rm-v2-email");
      const version = modal?.querySelector<HTMLInputElement>(".rm-form-stack input")?.value || "";
      if (!/avec prix/i.test(version)) return;
      const attachment = modal?.querySelector("footer strong")?.textContent?.trim() || "";
      const number = attachment.replace(/-sans-prix\.pdf$/i, "").replace(/\.pdf$/i, "");
      if (/^(FAC|F)-/i.test(number)) pendingInvoiceNumber = number;
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", onClick, true);
    refresh();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      cancelAnimationFrame(refreshFrame);
    };
  }, []);

  return null;
}
