"use client";

import { useEffect } from "react";

function openCopilot() {
  document.querySelector<HTMLButtonElement>(".mcp-launcher")?.click();
}

function installCopilotAccess() {
  const headerActions = document.querySelector<HTMLElement>(".rm-header-actions");
  if (headerActions && !headerActions.querySelector("[data-manufeo-copilot-header]")) {
    const headerButton = document.createElement("button");
    headerButton.type = "button";
    headerButton.dataset.manufeoCopilotHeader = "true";
    headerButton.setAttribute("aria-label", "Assistant IA chantier");
    headerButton.title = "Copilote chantier";
    headerButton.innerHTML = '<span aria-hidden="true" style="font-size:18px;line-height:1">✦</span>';
    headerButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCopilot();
    });
    headerActions.prepend(headerButton);
  }

  const drawer = document.querySelector<HTMLElement>(".rm-drawer-list");
  if (!drawer || drawer.querySelector("[data-manufeo-copilot-menu]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.manufeoCopilotMenu = "true";
  button.innerHTML = '<span aria-hidden="true">✦</span><div><strong>Copilote chantier</strong><small>Préparer et analyser un chantier avec l’IA</small></div><span aria-hidden="true">›</span>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.querySelector<HTMLButtonElement>(".rm-side-drawer header > button:first-child")?.click();
    window.setTimeout(openCopilot, 0);
  });
  drawer.prepend(button);
}

export default function MobileCopilotMenuBridge() {
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(installCopilotAccess);
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    refresh();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
