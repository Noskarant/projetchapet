"use client";

import { useEffect } from "react";

type MobileDocument = {
  type: "devis" | "facture";
  number: string;
  client: string;
  amount: string;
  project: string;
  issueDate: string;
  dueDate: string;
};

const CONVERTED_KEY = "projetchapet-converted-invoices";

function normalized(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function text(root: ParentNode, selector: string, fallback = "") {
  return root.querySelector(selector)?.textContent?.trim() || fallback;
}

function toast(message: string) {
  const node = document.createElement("div");
  node.className = "mda-toast";
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 2600);
}

export default function MobileAccentActionFix() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button || button.closest(".mda-overlay")) return;
      const label = normalized(button.textContent || "");
      const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (!sheet || normalized(text(sheet, "header small")) !== "facture" || label !== "creer un avoir") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const stored = JSON.parse(window.localStorage.getItem(CONVERTED_KEY) || "[]") as MobileDocument[];
      const credit: MobileDocument = {
        type: "facture",
        number: `A-2026-${String(stored.filter((item) => item.number.startsWith("A-")).length + 1).padStart(3, "0")}`,
        client: text(sheet, ".rm-detail-client strong", "Client"),
        amount: `-${text(sheet, ".rm-detail-amount strong", "0,00 €")}`,
        project: "Avoir sur facture",
        issueDate: "30 juil. 2026",
        dueDate: "Émis aujourd’hui",
      };
      window.localStorage.setItem(CONVERTED_KEY, JSON.stringify([credit, ...stored]));
      toast(`Avoir ${credit.number} créé.`);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
