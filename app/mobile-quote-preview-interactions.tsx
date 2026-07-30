"use client";

import { useEffect } from "react";

function acknowledge(button: HTMLButtonElement) {
  button.classList.remove("rm-preview-tab-acknowledged");
  void button.offsetWidth;
  button.classList.add("rm-preview-tab-acknowledged");
  window.setTimeout(() => button.classList.remove("rm-preview-tab-acknowledged"), 320);
}

function setText(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setButtonText(button: HTMLButtonElement | null, value: string) {
  if (!button) return;

  const textNode = Array.from(button.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  const nextValue = ` ${value}`;

  if (textNode) {
    if (textNode.textContent !== nextValue) textNode.textContent = nextValue;
  } else {
    button.append(document.createTextNode(nextValue));
  }

  button.setAttribute("aria-label", value);
}

function syncPreviewState() {
  document.querySelectorAll<HTMLElement>(".rm-philippe-preview").forEach((preview) => {
    const tabButtons = Array.from(
      preview.querySelectorAll<HTMLButtonElement>(".rm-philippe-preview-tabs button"),
    );

    tabButtons.forEach((button) => {
      button.type = "button";
      button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    });

    const pdfTab = tabButtons[1] ?? null;
    setButtonText(pdfTab, "PDF");
    setButtonText(
      preview.querySelector<HTMLButtonElement>(
        ".rm-philippe-preview-actions button:first-child",
      ),
      pdfTab?.classList.contains("active") ? "Voir le détail" : "Voir le PDF",
    );

    const lines = preview.querySelector<HTMLElement>(".rm-philippe-lines");
    if (!lines) return;

    const count = lines.querySelectorAll(".rm-philippe-line-card").length;
    const title = preview.querySelector(".rm-philippe-section-title strong");
    const hint = preview.querySelector<HTMLElement>(".rm-philippe-section-title > span");
    let singleMessage = preview.querySelector<HTMLElement>(".rm-single-post-message");

    setText(title, count === 1 ? "1 poste" : `${count} postes`);

    if (count === 1) {
      if (hint && !hint.hidden) hint.hidden = true;
      if (!singleMessage) {
        singleMessage = document.createElement("p");
        singleMessage.className = "rm-single-post-message";
        singleMessage.textContent = "Tous les postes du devis sont affichés.";
        lines.insertAdjacentElement("afterend", singleMessage);
      }
      return;
    }

    if (hint?.hidden) hint.hidden = false;
    setText(hint, `Faites défiler pour consulter les ${count} postes`);
    singleMessage?.remove();
  });
}

export default function MobileQuotePreviewInteractions() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const observer = new MutationObserver(syncPreviewState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["class"],
    });
    syncPreviewState();

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const preview = target.closest<HTMLElement>(".rm-philippe-preview");
      if (!preview) return;

      const tabButton = target.closest<HTMLButtonElement>(
        ".rm-philippe-preview-tabs button",
      );
      const switchButton = target.closest<HTMLButtonElement>(
        ".rm-philippe-preview-actions button:first-child",
      );
      const button = tabButton || switchButton;
      if (!button) return;

      acknowledge(button);
      window.setTimeout(() => {
        syncPreviewState();
        preview
          .querySelector<HTMLElement>(".rm-philippe-preview-scroll")
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    };

    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
