"use client";

import { useLayoutEffect } from "react";

export default function DefaultMobileTab() {
  useLayoutEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;

    const devisButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")
    ).find((button) => button.textContent?.trim() === "Devis");

    devisButton?.click();
  }, []);

  return null;
}
