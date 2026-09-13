"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const BUTTON_ATTRIBUTE = "data-manufeo-einvoice-send";

function invoiceNumber(sheet: Element) {
  return sheet.querySelector("header h2")?.textContent?.trim() ?? "";
}

function isInvoiceSheet(sheet: Element) {
  return sheet.querySelector("header small")?.textContent?.trim().toUpperCase() === "FACTURE";
}

function isDraft(sheet: Element) {
  return /brouillon/i.test(sheet.querySelector(".rm-status")?.textContent ?? "");
}

async function sendElectronicInvoice(button: HTMLButtonElement, sheet: Element) {
  const number = invoiceNumber(sheet);
  if (!number) return;
  if (isDraft(sheet)) {
    window.alert("Passez la facture hors brouillon avant sa transmission réglementaire.");
    return;
  }
  if (!window.confirm(`Transmettre réellement la facture ${number} via la plateforme agréée SUPER PDP ?\n\nCette action envoie la facture électronique au réseau réglementaire. Vérifiez le client, les lignes, la TVA et les montants avant de continuer.`)) {
    return;
  }

  const previous = button.textContent || "Envoyer facture électronique";
  button.disabled = true;
  button.textContent = "Transmission…";
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Reconnectez-vous à MANUFEO avant d’envoyer une facture électronique.");

    const response = await fetch("/api/einvoice/superpdp/transmit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invoiceNumber: number }),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(body.error ?? "Transmission réglementaire impossible."));

    const status = typeof body.status === "string" && body.status ? body.status : "transmise";
    button.textContent = `E-facture ${status}`;
    button.dataset.manufeoEinvoiceSent = "true";
    button.title = `Facture ${number} transmise via SUPER PDP`;
    window.alert(`La facture ${number} a été transmise à SUPER PDP.\n\nStatut : ${status}.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = previous;
    window.alert(error instanceof Error ? error.message : "Transmission réglementaire impossible.");
  }
}

function enhanceInvoiceSheets() {
  for (const sheet of Array.from(document.querySelectorAll(".rm-detail-sheet"))) {
    if (!isInvoiceSheet(sheet)) continue;
    const actions = sheet.querySelector<HTMLElement>(".rm-detail-actions");
    if (!actions || actions.querySelector(`[${BUTTON_ATTRIBUTE}]`)) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(BUTTON_ATTRIBUTE, "true");
    button.setAttribute("aria-label", "Envoyer facture électronique");
    button.textContent = "Envoyer facture électronique";
    if (isDraft(sheet)) {
      button.disabled = true;
      button.title = "Passez d’abord la facture hors brouillon";
    }
    button.addEventListener("click", () => void sendElectronicInvoice(button, sheet));
    actions.insertBefore(button, actions.children[1] ?? null);
  }
}

export default function MobileElectronicInvoiceSendBridge() {
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(enhanceInvoiceSheets);
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    refresh();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
