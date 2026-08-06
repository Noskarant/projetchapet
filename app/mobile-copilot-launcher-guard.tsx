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

function setStyleProperty(element: HTMLElement, property: "bottom" | "right", value: string) {
  if (element.style[property] !== value) element.style[property] = value;
}

function removeStyleProperty(element: HTMLElement, property: "bottom" | "right") {
  if (element.style[property]) element.style.removeProperty(property);
}

function applyLauncherState(launcher: HTMLElement, blocked: boolean) {
  const display = blocked ? "none" : "";
  const pointerEvents = blocked ? "none" : "";

  if (launcher.style.display !== display) launcher.style.display = display;
  if (launcher.style.pointerEvents !== pointerEvents) launcher.style.pointerEvents = pointerEvents;
  if (launcher.hidden !== blocked) launcher.hidden = blocked;

  if (blocked && launcher.getAttribute("aria-hidden") !== "true") launcher.setAttribute("aria-hidden", "true");
  if (!blocked && launcher.hasAttribute("aria-hidden")) launcher.removeAttribute("aria-hidden");
}

function placeLauncherAboveCreateDock(launcher: HTMLElement) {
  const dock = document.querySelector<HTMLElement>(".rm-create-dock");
  const app = document.querySelector<HTMLElement>(".rm-app");

  if (!dock || !isVisible(dock)) {
    removeStyleProperty(launcher, "bottom");
    removeStyleProperty(launcher, "right");
    return;
  }

  const dockRect = dock.getBoundingClientRect();
  const appRect = app?.getBoundingClientRect();
  const bottom = Math.max(16, Math.ceil(window.innerHeight - dockRect.top + 10));
  const right = appRect
    ? Math.max(15, Math.ceil(window.innerWidth - appRect.right + 15))
    : 15;

  setStyleProperty(launcher, "bottom", `${bottom}px`);
  setStyleProperty(launcher, "right", `${right}px`);
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
        if (!blocked) placeLauncherAboveCreateDock(launcher);
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
    window.visualViewport?.addEventListener("resize", update);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.cancelAnimationFrame(frame);
      const launcher = document.querySelector<HTMLElement>(".mcp-launcher");
      if (launcher) {
        applyLauncherState(launcher, false);
        removeStyleProperty(launcher, "bottom");
        removeStyleProperty(launcher, "right");
      }
    };
  }, []);

  return (
    <style>{`
      @media (max-width: 820px) {
        .mcp-launcher {
          max-width: min(220px, calc(100vw - 30px));
          min-height: 46px;
          justify-content: center;
          white-space: nowrap;
        }

        body:has(.mcp-launcher:not([hidden])) .rm-list-scroll,
        body:has(.mcp-launcher:not([hidden])) .rm-home-section .rm-scroll-area {
          padding-bottom: 148px;
        }
      }
    `}</style>
  );
}
