"use client";

import { useEffect } from "react";

const RESET_LINK_SELECTOR = "[data-forgeo-reset-password]";

export default function AuthSelfServiceBridge() {
  useEffect(() => {
    const attachResetLink = () => {
      const form = document.querySelector<HTMLFormElement>(".forgeo-auth-form");
      const existing = document.querySelector<HTMLAnchorElement>(RESET_LINK_SELECTOR);
      if (!form) {
        existing?.remove();
        return;
      }

      const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
      const passwordLabel = passwordInput?.closest("label");
      const isLogin = passwordInput?.autocomplete === "current-password";
      if (!passwordLabel || !isLogin) {
        existing?.remove();
        return;
      }
      if (existing && form.contains(existing)) return;
      existing?.remove();

      const link = document.createElement("a");
      link.href = "/reset-password";
      link.dataset.forgeoResetPassword = "true";
      link.className = "forgeo-auth-reset-link";
      link.textContent = "Mot de passe oublié ?";
      passwordLabel.insertAdjacentElement("afterend", link);
    };

    attachResetLink();
    const observer = new MutationObserver(attachResetLink);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["autocomplete"],
    });
    return () => observer.disconnect();
  }, []);

  return <style>{`.forgeo-auth-reset-link{justify-self:end;margin-top:-6px;color:#355c4f;text-decoration:none;font:850 10px Arial,sans-serif}.forgeo-auth-reset-link:hover{text-decoration:underline}.forgeo-auth-reset-link:focus-visible{outline:2px solid #527267;outline-offset:3px;border-radius:3px}`}</style>;
}
