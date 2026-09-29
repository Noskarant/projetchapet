"use client";

import { FIELD_INTERFACE_QUERY } from "@/lib/responsive-interface";

import { useLayoutEffect } from "react";

export default function DefaultMobileTab() {
  useLayoutEffect(() => {
    if (!window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;

    const devisButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button")
    ).find((button) => button.textContent?.trim() === "Devis");

    devisButton?.click();
  }, []);

  return null;
}
