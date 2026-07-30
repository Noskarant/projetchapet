"use client";

import { useEffect } from "react";

function acknowledge(button: HTMLButtonElement) {
  button.classList.remove("rm-preview-tab-acknowledged");
  void button.offsetWidth;
  button.classList.add("rm-preview-tab-acknowledged");
  window.setTimeout(() => button.classList.remove("rm-preview-tab-acknowledged"), 320);
}

function syncPressedState() {
  document
    .querySelectorAll<HTMLButtonElement>(".rm-philippe-preview-tabs button")
    .forEach((button) => {
      button.type = "button";
      button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    });
}

export default function MobileQuotePreviewInteractions() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const observer = new MutationObserver(syncPressedState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    syncPressedState();

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
        syncPressedState();
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