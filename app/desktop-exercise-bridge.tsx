"use client";

import { useEffect } from "react";
import { accountingExerciseLabel, readCompanyProfile } from "@/lib/company-profile";

const EXERCISE_YEAR_STORAGE_KEY = "manufeo:accounting-exercise-year:v1";

function readExerciseYear() {
  const fallback = new Date().getFullYear();
  const stored = Number(window.localStorage.getItem(EXERCISE_YEAR_STORAGE_KEY));
  return Number.isInteger(stored) && stored >= 2000 && stored <= 2100 ? stored : fallback;
}

export default function DesktopExerciseBridge() {
  useEffect(() => {
    let popover: HTMLDivElement | null = null;
    let exerciseButton: HTMLButtonElement | null = null;

    const findButton = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button.pc-secondary")).find(
        (candidate) => candidate.textContent?.includes("Exercice"),
      ) ?? null;

    function positionPopover() {
      if (!popover || !exerciseButton) return;
      const rect = exerciseButton.getBoundingClientRect();
      const width = 220;
      const left = Math.min(
        Math.max(12, rect.right - width),
        Math.max(12, window.innerWidth - width - 12),
      );
      popover.style.left = `${left}px`;
      popover.style.top = `${rect.bottom + 8}px`;
    }

    function closePopover() {
      popover?.remove();
      popover = null;
      if (exerciseButton) exerciseButton.setAttribute("aria-expanded", "false");
    }

    function selectYear(year: number) {
      window.localStorage.setItem(EXERCISE_YEAR_STORAGE_KEY, String(year));
      closePopover();
      synchronize();
      window.dispatchEvent(
        new CustomEvent("manufeo:accounting-exercise-year-updated", {
          detail: { year },
        }),
      );
    }

    function openPopover(button: HTMLButtonElement) {
      if (popover) {
        closePopover();
        return;
      }

      exerciseButton = button;
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "true");

      const currentYear = new Date().getFullYear();
      const selectedYear = readExerciseYear();
      const years = Array.from(
        new Set([
          selectedYear,
          currentYear + 1,
          currentYear,
          currentYear - 1,
          currentYear - 2,
          currentYear - 3,
        ]),
      ).sort((a, b) => b - a);

      const menu = document.createElement("div");
      menu.className = "manufeo-exercise-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Choisir l’année de l’exercice");
      Object.assign(menu.style, {
        position: "fixed",
        zIndex: "20000",
        width: "220px",
        padding: "8px",
        border: "1px solid #dbe3eb",
        borderRadius: "12px",
        background: "#ffffff",
        boxShadow: "0 16px 38px rgba(17, 42, 66, .16)",
      });

      const heading = document.createElement("div");
      heading.textContent = "Année de l’exercice";
      Object.assign(heading.style, {
        padding: "7px 9px 8px",
        color: "#66768a",
        fontSize: "10px",
        fontWeight: "800",
        letterSpacing: ".04em",
        textTransform: "uppercase",
      });
      menu.appendChild(heading);

      for (const year of years) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", String(year === selectedYear));
        option.textContent = String(year);
        Object.assign(option.style, {
          width: "100%",
          minHeight: "38px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          border: "0",
          borderRadius: "8px",
          color: year === selectedYear ? "#ffffff" : "#20364a",
          background: year === selectedYear ? "#1769aa" : "transparent",
          font: "700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif",
          cursor: "pointer",
        });
        if (year === selectedYear) option.textContent = `${year}  ✓`;
        option.addEventListener("click", () => selectYear(year));
        menu.appendChild(option);
      }

      document.body.appendChild(menu);
      popover = menu;
      positionPopover();
      window.setTimeout(() => menu.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    }

    function synchronize() {
      if (window.matchMedia("(max-width: 820px)").matches) {
        closePopover();
        return;
      }
      const button = findButton();
      if (!button) return;
      exerciseButton = button;
      button.setAttribute("aria-label", "Choisir l’année de l’exercice");
      button.setAttribute("aria-haspopup", "menu");
      if (!popover) button.setAttribute("aria-expanded", "false");

      const profile = readCompanyProfile(window.localStorage);
      const label = accountingExerciseLabel(profile, readExerciseYear());
      const textNode = Array.from(button.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Exercice"),
      );
      if (textNode && textNode.textContent?.trim() !== label) {
        textNode.textContent = ` ${label} `;
      }
    }

    const click = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>("button.pc-secondary");
      if (button?.textContent?.includes("Exercice")) {
        event.preventDefault();
        event.stopPropagation();
        openPopover(button);
        return;
      }
      if (popover && target && !popover.contains(target)) closePopover();
    };

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && popover) {
        closePopover();
        exerciseButton?.focus();
      }
    };

    const update = () => synchronize();
    const resize = () => positionPopover();
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    window.addEventListener("projetchapet:company-profile-updated", update);
    synchronize();

    return () => {
      closePopover();
      observer.disconnect();
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
      window.removeEventListener("projetchapet:company-profile-updated", update);
    };
  }, []);

  return null;
}
