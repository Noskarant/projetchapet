"use client";

import { useEffect } from "react";
import {
  companyProfileDisplayName,
  readCompanyProfile,
} from "@/lib/company-profile";

function directText(element: Element | null, value: string) {
  if (element instanceof HTMLElement && element.textContent !== value) {
    element.textContent = value;
  }
}

function fieldByLabel(root: ParentNode, labelText: string) {
  const label = Array.from(root.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.trim().toLowerCase().startsWith(labelText.toLowerCase()),
  );
  return label?.querySelector<HTMLInputElement>("input") ?? null;
}

function hydrateField(root: ParentNode, label: string, value: string) {
  const input = fieldByLabel(root, label);
  if (!input || input.dataset.forgeoProfileHydrated === "true") return;
  input.value = value;
  input.dataset.forgeoProfileHydrated = "true";
}

function closeMobileMenu() {
  window.setTimeout(() => {
    document
      .querySelector<HTMLButtonElement>(".rm-side-drawer header > button:first-child")
      ?.click();
  }, 0);
}

function addMobileTool(
  host: HTMLElement,
  key: string,
  icon: string,
  title: string,
  detail: string,
  action: () => void,
) {
  if (host.querySelector(`[data-forgeo-menu-tool="${key}"]`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.forgeoMenuTool = key;
  button.innerHTML = `<span aria-hidden="true">${icon}</span><div><strong>${title}</strong><small>${detail}</small></div><span aria-hidden="true">›</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    closeMobileMenu();
  });
  host.appendChild(button);
}

function installMobileTools() {
  const drawer = document.querySelector<HTMLElement>(".rm-drawer-list");
  if (!drawer) return;
  addMobileTool(
    drawer,
    "trade",
    "◆",
    "Métier & tarifs",
    "Vos prix, marges et réglages métier",
    () => window.dispatchEvent(new Event("forgeo:open-business-settings")),
  );
  addMobileTool(
    drawer,
    "profitability",
    "↗",
    "Rentabilité chantier",
    "Comparez vendu, coûts réels et marge",
    () => window.dispatchEvent(new Event("forgeo:open-project-profitability")),
  );
}

function installDesktopActions() {
  if (!window.matchMedia("(min-width: 821px)").matches) return;
  const host = document.querySelector<HTMLElement>(".pc-top-actions");
  if (!host) return;

  if (!host.querySelector("[data-forgeo-top-documents]")) {
    const documents = document.createElement("button");
    documents.type = "button";
    documents.className = "forgeo-topbar-action forgeo-topbar-documents";
    documents.dataset.forgeoTopDocuments = "true";
    documents.textContent = "Documents";
    documents.addEventListener("click", () => {
      const source = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".pc-enhancement-launcher button"),
      ).find((button) => /PDF|envoi/i.test(button.textContent || ""));
      source?.click();
    });
    host.appendChild(documents);
  }

  if (!host.querySelector("[data-forgeo-top-account]")) {
    const account = document.createElement("button");
    account.type = "button";
    account.className = "forgeo-topbar-action forgeo-topbar-account";
    account.dataset.forgeoTopAccount = "true";
    account.textContent = "Compte";
    account.addEventListener("click", () => {
      document.querySelector<HTMLButtonElement>(".forgeo-account-fallback")?.click();
    });
    host.appendChild(account);
  }
}

function sanitizeAccountPanel() {
  const panel = document.querySelector<HTMLElement>(".forgeo-account-panel");
  if (!panel) return;
  directText(panel.querySelector("header small"), "MON COMPTE");
  const role = Array.from(panel.querySelectorAll<HTMLElement>(".forgeo-account-meta > span")).find((node) =>
    /^Rôle\s*:/i.test(node.textContent || ""),
  );
  if (role) {
    const raw = role.textContent || "";
    const friendly = /owner/i.test(raw) ? "Administrateur" : /member/i.test(raw) ? "Collaborateur" : raw.replace(/^Rôle\s*:\s*/i, "");
    directText(role, `Accès · ${friendly}`);
  }
}

function sanitizeDesktop() {
  const profile = readCompanyProfile(window.localStorage);
  const displayName = companyProfileDisplayName(profile, "Votre entreprise");

  directText(document.querySelector(".pc-brand > div"), "F");
  directText(document.querySelector(".pc-brand strong"), "FORGEO");
  directText(document.querySelector(".pc-brand small"), "Gestion artisans");

  const company = document.querySelector<HTMLElement>(".pc-company");
  if (company) {
    directText(company.querySelector("span"), "Entreprise");
    directText(company.querySelector("strong"), displayName);
    directText(
      company.querySelector("small"),
      [profile.postalCode, profile.city].filter(Boolean).join(" ") || "Profil entreprise",
    );
  }

  document.querySelectorAll<HTMLElement>(".pc-crud-modal header span").forEach((node) =>
    directText(node, "FORGEO"),
  );

  const settings = document.querySelector<HTMLElement>(".pc-settings-grid");
  if (settings) {
    hydrateField(settings, "Raison sociale", profile.legalName || "");
    hydrateField(settings, "SIRET", profile.siret || "");
    hydrateField(settings, "TVA intracommunautaire", profile.vatNumber || "");
    hydrateField(settings, "Téléphone", profile.phone || "");
    hydrateField(settings, "E-mail du cabinet", profile.accountingEmail || "");
    const heading = settings.previousElementSibling;
    if (heading instanceof HTMLElement) {
      const paragraph = heading.querySelector("p");
      if (paragraph && /seront branchés|prochaine étape/i.test(paragraph.textContent || "")) {
        paragraph.textContent = "Gérez votre entreprise, vos documents et vos préférences.";
      }
      const inactiveSave = Array.from(heading.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => /^Enregistrer$/i.test(button.textContent?.trim() || ""),
      );
      if (inactiveSave) inactiveSave.hidden = true;
    }
  }

  sanitizeAccountPanel();
  installDesktopActions();
}

function sanitizeMobile() {
  document
    .querySelectorAll<HTMLElement>(".rm-side-drawer header small, .rm-commercial-header small")
    .forEach((node) => directText(node, "FORGEO"));

  document.querySelectorAll<HTMLElement>(".rm-commercial-live").forEach((node) => {
    if (/démo|locale/i.test(node.textContent || "")) node.innerHTML = "<i></i> Données privées";
  });

  document
    .querySelectorAll<HTMLElement>(".rm-side-drawer strong, .rm-side-drawer small, .mcp-message")
    .forEach((node) => {
      const text = node.textContent || "";
      if (/CHAPET Père & Fils|CHAPET SAS/i.test(text)) node.textContent = "Votre entreprise";
      else if (/compta@saschapet\.com|comptabilite@cabinet-loire\.fr/i.test(text)) node.textContent = "À renseigner";
      else if (/Logo CHAPET/i.test(text)) node.textContent = "Aucun logo configuré";
      else if (/dans CHAPET/i.test(text)) node.textContent = text.replace(/CHAPET/gi, "FORGEO");
    });

  const workCard = document.querySelector<HTMLButtonElement>(".rm-work-card");
  if (workCard && /SCI Bellevue|Peinture murs|Hall d’entrée/i.test(workCard.textContent || "")) {
    workCard.disabled = true;
    workCard.dataset.forgeoEmptyProject = "true";
    workCard.innerHTML =
      "<div><small>CHANTIERS</small><strong>Aucun chantier sélectionné</strong><span>Créez ou ouvrez un chantier pour afficher les actions.</span></div>";
  }

  const profile = readCompanyProfile(window.localStorage);
  const displayName = companyProfileDisplayName(profile, "Votre entreprise");
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".rm-settings-cards > div"));
  for (const card of cards) {
    const label = card.querySelector("span")?.textContent?.trim() || "";
    const value = card.querySelector<HTMLElement>("strong");
    if (!value) continue;
    if (label === "Raison sociale") directText(value, profile.legalName || displayName);
    if (label === "SIRET") directText(value, profile.siret || "À renseigner");
    if (label === "Copie automatique au comptable") directText(value, profile.accountingEmail || "À renseigner");
    if (label === "Logo") directText(value, profile.logoDataUrl ? "Logo entreprise configuré" : "Aucun logo configuré");
  }

  sanitizeAccountPanel();
  installMobileTools();
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function installDesktopIdentityFetchBridge() {
  const originalFetch = window.fetch.bind(window);
  const bridgedFetch: typeof window.fetch = async (input, init) => {
    if (!window.matchMedia("(min-width: 821px)").matches || typeof init?.body !== "string") {
      return originalFetch(input, init);
    }

    const url = requestUrl(input);
    if (!url.includes("/api/email") && !url.includes("/api/einvoice")) {
      return originalFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      const profile = readCompanyProfile(window.localStorage);
      const displayName = companyProfileDisplayName(profile, "Votre entreprise");

      if (url.includes("/api/email") && typeof body.html === "string") {
        body.html = body.html
          .replaceAll("CHAPET SAS", displayName)
          .replaceAll("CHAPET Père & Fils", displayName)
          .replaceAll("Projet Chapet", "FORGEO");
      }

      if (url.includes("/api/einvoice")) {
        body.company = {
          name: profile.legalName || displayName,
          siret: profile.siret || "",
          vat_number: profile.vatNumber || "",
        };
      }

      return originalFetch(input, { ...init, body: JSON.stringify(body) });
    } catch {
      return originalFetch(input, init);
    }
  };
  window.fetch = bridgedFetch;
  return () => {
    if (window.fetch === bridgedFetch) window.fetch = originalFetch;
  };
}

export default function ProductUiPolish() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        sanitizeDesktop();
        sanitizeMobile();
      });
    };

    const restoreFetch = installDesktopIdentityFetchBridge();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", enhance);
    window.addEventListener("projetchapet:company-profile-updated", enhance);
    enhance();

    return () => {
      restoreFetch();
      observer.disconnect();
      window.removeEventListener("resize", enhance);
      window.removeEventListener("projetchapet:company-profile-updated", enhance);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
