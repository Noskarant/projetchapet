"use client";

import { useEffect, useRef, useState } from "react";
import { customerDisplayName, type MobileWorkspace } from "@/lib/mobile-prototype";
import { matchMobileCustomer } from "@/lib/mobile-customer-match";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";

type AiApplyDetail = {
  target?: "quote" | "invoice" | "customer";
  data?: { customer_hint?: string };
};

export default function MobileAiApplyGuard() {
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const show = (value: string) => {
      setMessage(value);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(""), 4800);
    };

    const guard = (event: Event) => {
      const detail = (event as CustomEvent<AiApplyDetail>).detail;
      if (!detail || detail.target === "customer") return;

      let workspace: MobileWorkspace | null = null;
      try {
        const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
        workspace = raw ? JSON.parse(raw) as MobileWorkspace : null;
      } catch {
        workspace = null;
      }

      const result = matchMobileCustomer(workspace?.customers ?? [], detail.data?.customer_hint);
      if (result.status === "matched") {
        if (detail.data) detail.data.customer_hint = customerDisplayName(result.matches[0]);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (result.status === "missing") {
        show("Indiquez le nom du client dans la dictée avant de créer le document.");
      } else if (result.status === "ambiguous") {
        show("Plusieurs clients correspondent. Dictez un nom plus précis.");
      } else {
        show(`Client « ${detail.data?.customer_hint || "inconnu"} » introuvable. Créez-le d’abord dans Clients.`);
      }
    };

    window.addEventListener("projetchapet:ai-apply", guard, { capture: true });
    return () => {
      window.removeEventListener("projetchapet:ai-apply", guard, { capture: true });
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        zIndex: 100000,
        left: 16,
        right: 16,
        bottom: 106,
        margin: "0 auto",
        maxWidth: 520,
        padding: "14px 16px",
        borderRadius: 14,
        background: "#7f1d1d",
        color: "#fff",
        boxShadow: "0 16px 40px rgba(30, 41, 59, 0.28)",
        fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  );
}
