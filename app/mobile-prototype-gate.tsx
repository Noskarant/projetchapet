"use client";

import { useEffect, useState } from "react";
import MobileAccountingAction from "./mobile-accounting-action";
import MobileAgendaAiBridge from "./mobile-agenda-ai-bridge";
import MobileAiApplyGuard from "./mobile-ai-apply-guard";
import MobileAiAssistantV6 from "./mobile-ai-assistant-v6";
import MobileAiContextBridge from "./mobile-ai-context-bridge";
import MobileAutoPdfPreview from "./mobile-auto-pdf-preview";
import MobileCommercialDemo from "./mobile-commercial-demo";
import MobileLongVoiceBridge from "./mobile-long-voice-bridge";
import MobilePriorityPolish from "./mobile-priority-polish";
import MobileQuotePreviewInteractions from "./mobile-quote-preview-interactions";
import RappidosMobileShellV2 from "./rappidos-mobile-shell-v2";
import { seedMobileWorkspace } from "@/lib/mobile-prototype";
import { prepareMobileWorkspaceStorage } from "@/lib/mobile-workspace-storage";

export default function MobilePrototypeGate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      prepareMobileWorkspaceStorage(window.localStorage, seedMobileWorkspace());
    } catch (error) {
      console.warn("[Projet Chapet] Préparation du stockage mobile impossible", error);
    } finally {
      setReady(true);
    }
  }, []);

  if (!ready) {
    return (
      <main
        aria-label="Chargement du prototype"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f3f6f9",
          color: "#102a43",
          fontFamily: "Arial, sans-serif",
          fontWeight: 800,
        }}
      >
        Projet Chapet
      </main>
    );
  }

  return (
    <>
      <MobileAiContextBridge />
      <MobileLongVoiceBridge />
      <MobileAiApplyGuard />
      <RappidosMobileShellV2 />
      <MobilePriorityPolish />
      <MobileAiAssistantV6 />
      <MobileAgendaAiBridge />
      <MobileAutoPdfPreview />
      <MobileQuotePreviewInteractions />
      <MobileAccountingAction />
      <MobileCommercialDemo />
    </>
  );
}
