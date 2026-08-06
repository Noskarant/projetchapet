"use client";

import { useEffect } from "react";

const BLOCKING_SURFACE_SELECTOR = [
  ".rm-v2-editor",
  ".rm-create-sheet",
  "[data-philippe-quote-editor='true']",
  "[data-philippe-quote-sheet='true']",
].join(",");

function isVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function applyLauncherState(launcher: HTMLElement, blocked: boolean) {
  const display = blocked ? "none" : "";
  const pointerEvents = blocked ? "none" : "";

  if (launcher.style.display !== display) launcher.style.display = display;
  if (launcher.style.pointerEvents !== pointerEvents) launcher.style.pointerEvents = pointerEvents;
  if (launcher.hidden !== blocked) launcher.hidden = blocked;

  if (blocked) launcher.setAttribute("aria-hidden", "true");
  else launcher.removeAttribute("aria-hidden");
}

export default function MobileCopilotLauncherGuard() {
  useEffect(() => {
    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const launcher = document.querySelector<HTMLElement>(".mcp-launcher");
        if (!launcher) return;
        const blocked = Array.from(document.querySelectorAll(BLOCKING_SURFACE_SELECTOR)).some(isVisible);
        applyLauncherState(launcher, blocked);
      });
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
    window.addEventListener("resize", update);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.cancelAnimationFrame(frame);
      const launcher = document.querySelector<HTMLElement>(".mcp-launcher");
      if (launcher) applyLauncherState(launcher, false);
    };
  }, []);

  return null;
}
