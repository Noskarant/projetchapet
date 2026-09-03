"use client";

import { useEffect } from "react";
import { accountingExerciseLabel, readCompanyProfile } from "@/lib/company-profile";

export default function DesktopExerciseBridge() {
  useEffect(() => {
    function synchronize() {
      if (window.matchMedia("(max-width: 820px)").matches) return;
      const profile = readCompanyProfile(window.localStorage);
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button.pc-secondary"))
        .find((candidate) => candidate.textContent?.includes("Exercice"));
      if (!button) return;
      const label = accountingExerciseLabel(profile);
      const textNode = Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Exercice"));
      if (textNode && textNode.textContent?.trim() !== label) textNode.textContent = ` ${label} `;
    }

    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button.pc-secondary");
      if (!button?.textContent?.includes("Exercice")) return;
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new Event("projetchapet:open-company-profile"));
    };
    const update = () => synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("click", click, true);
    window.addEventListener("projetchapet:company-profile-updated", update);
    synchronize();
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      window.removeEventListener("projetchapet:company-profile-updated", update);
    };
  }, []);
  return null;
}
