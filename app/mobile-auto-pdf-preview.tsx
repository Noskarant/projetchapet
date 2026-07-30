"use client";

import { useEffect } from "react";

async function waitForPreviewButton() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2500) {
    const detail = document.querySelector<HTMLElement>(".rm-detail-sheet");
    const button = detail
      ? Array.from(detail.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
          (item.textContent || "").toLocaleLowerCase("fr-FR").includes("aperçu pdf"),
        )
      : null;
    if (button) return button;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return null;
}

export default function MobileAutoPdfPreview() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    let sequence = 0;
    const handler = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLButtonElement>(".rm-document-card");
      if (!card) return;
      const currentSequence = ++sequence;
      window.setTimeout(async () => {
        const previewButton = await waitForPreviewButton();
        if (currentSequence !== sequence || !previewButton) return;
        previewButton.click();
      }, 0);
    };

    document.addEventListener("click", handler);
    return () => {
      sequence += 1;
      document.removeEventListener("click", handler);
    };
  }, []);

  return null;
}
