"use client";

import { useEffect } from "react";

type AiTarget = "quote" | "invoice" | "customer" | "agenda";

function activeAiTarget(): AiTarget {
  const label = document.querySelector(".rm-bottom-nav button.active")?.textContent || "";
  if (label.includes("Factures")) return "invoice";
  if (label.includes("Clients")) return "customer";
  if (label.includes("Agenda")) return "agenda";
  return "quote";
}

function replaceDockContent() {
  const main = document.querySelector<HTMLButtonElement>(".rm-create-main");
  if (main && main.dataset.mobilePriority !== "true") {
    main.dataset.mobilePriority = "true";
    main.setAttribute("aria-label", "Créer avec l’IA");
    main.innerHTML = "<span>Créer avec IA</span><small>Dictée vocale</small>";
  }

  const originalManual = document.querySelector<HTMLButtonElement>(".rm-create-ai");
  if (originalManual) {
    originalManual.classList.remove("rm-create-ai");
    originalManual.classList.add("rm-create-manual");
    originalManual.dataset.mobilePriority = "true";
    originalManual.setAttribute("aria-label", "Créer manuellement");
    originalManual.innerHTML = "<span>Créer<br>manuellement</span>";
  }

  const manual = document.querySelector<HTMLButtonElement>(".rm-create-manual");
  if (manual && manual.dataset.mobilePriority !== "true") {
    manual.dataset.mobilePriority = "true";
    manual.setAttribute("aria-label", "Créer manuellement");
    manual.innerHTML = "<span>Créer<br>manuellement</span>";
  }
}

function hideTechnicalProviderName() {
  const safeLabel = "Analyse terminée · à vérifier";
  document.querySelectorAll<HTMLElement>(".mai-success small").forEach((node) => {
    // Ne pas réécrire un texte déjà correct : textContent déclenche sinon
    // le MutationObserver à l'infini au passage de « Préparation » au résultat.
    if (node.textContent !== safeLabel) node.textContent = safeLabel;
  });
}

function closeDetailAfterOpeningEditor(button: HTMLButtonElement) {
  const sheet = button.closest<HTMLElement>(".rm-detail-sheet");
  if (!sheet) return;
  const back = sheet.querySelector<HTMLButtonElement>("header > button:first-child");
  window.setTimeout(() => back?.click(), 0);
}

export default function MobilePriorityPolish() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const numberFormatDescriptor = Object.getOwnPropertyDescriptor(
      Intl.NumberFormat.prototype,
      "format",
    );
    const originalFormatGetter = numberFormatDescriptor?.get;

    if (numberFormatDescriptor && originalFormatGetter) {
      Object.defineProperty(Intl.NumberFormat.prototype, "format", {
        configurable: numberFormatDescriptor.configurable,
        enumerable: numberFormatDescriptor.enumerable,
        get: function getSafeFrenchNumberFormat(this: Intl.NumberFormat) {
          const originalFormatter = originalFormatGetter.call(this) as (
            value: number | bigint,
          ) => string;
          return (value: number | bigint) =>
            originalFormatter(value)
              .replace(/[\u00a0\u202f]/g, " ")
              .replace(/\s+€/g, " €");
        },
      });
    }

    const refresh = () => {
      replaceDockContent();
      hideTechnicalProviderName();
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    refresh();

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
      if (!button) return;

      if (button.matches(".rm-create-main")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.dispatchEvent(
          new CustomEvent("projetchapet:open-ai", {
            detail: { target: activeAiTarget() },
          }),
        );
        return;
      }

      if (button.matches(".rm-create-manual")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        document.querySelector<HTMLButtonElement>(".rm-header-plus")?.click();
        return;
      }

      const detailSheet = button.closest<HTMLElement>(".rm-detail-sheet");
      if (!detailSheet) return;

      const normalizedLabel = (button.textContent || "")
        .trim()
        .toLocaleLowerCase("fr-FR");
      const isHeaderEdit =
        button.closest("header") === detailSheet.querySelector("header") &&
        button === detailSheet.querySelector("header > button:last-child");
      const opensEditor =
        isHeaderEdit ||
        normalizedLabel.includes("tout modifier") ||
        normalizedLabel === "modifier" ||
        normalizedLabel.includes("modifier le") ||
        normalizedLabel.includes("dupliquer");

      if (opensEditor) closeDetailAfterOpeningEditor(button);
    };

    document.addEventListener("click", onClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      if (numberFormatDescriptor) {
        Object.defineProperty(
          Intl.NumberFormat.prototype,
          "format",
          numberFormatDescriptor,
        );
      }
    };
  }, []);

  return null;
}
