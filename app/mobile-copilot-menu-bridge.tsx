"use client";

import { useEffect } from "react";

function installCopilotMenuEntry() {
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
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".mcp-launcher")?.click();
    }, 0);
  });
  drawer.prepend(button);
}

export default function MobileCopilotMenuBridge() {
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(installCopilotMenuEntry);
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
