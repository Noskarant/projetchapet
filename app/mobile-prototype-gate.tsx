"use client";

import { useEffect, useState } from "react";
import MobileAccountingAction from "./mobile-accounting-action";
import MobileAgendaAiBridge from "./mobile-agenda-ai-bridge";
import MobileAiApplyGuard from "./mobile-ai-apply-guard";
import MobileAiAssistantV6 from "./mobile-ai-assistant-v6";
import MobileAiContextBridge from "./mobile-ai-context-bridge";
import MobileAutoPdfPreview from "./mobile-auto-pdf-preview";
import MobileCommercialDemo from "./mobile-commercial-demo";
import MobileCopilotAssistant from "./mobile-copilot-assistant";
import MobileCopilotBusinessProfileBridge from "./mobile-copilot-business-profile-bridge";
import MobileCopilotDictationBridge from "./mobile-copilot-dictation-bridge";
import MobileCopilotLauncherGuard from "./mobile-copilot-launcher-guard";
import MobileElectronicInvoicingReadiness from "./mobile-electronic-invoicing-readiness";
import MobileForgeoBusinessSettings from "./mobile-forgeo-business-settings";
import MobileLegacyQuoteDetailGuard from "./mobile-legacy-quote-detail-guard";
import MobileLongVoiceBridge from "./mobile-long-voice-bridge";
import MobilePhilippeQuoteActionsMenu from "./mobile-philippe-quote-actions-menu";
import MobilePriorityPolish from "./mobile-priority-polish";
import MobileQuotePreviewInteractions from "./mobile-quote-preview-interactions";
import MobileUnifiedQuoteSheet from "./mobile-unified-quote-sheet";
import MobileVoiceEditAssistant from "./mobile-voice-edit-assistant";
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
      <MobileLegacyQuoteDetailGuard />
      <MobilePriorityPolish />
      <MobileAiAssistantV6 />
      <MobileCopilotBusinessProfileBridge />
      <MobileCopilotAssistant />
      <MobileCopilotDictationBridge />
      <MobileCopilotLauncherGuard />
      <MobileForgeoBusinessSettings />
      <MobileAgendaAiBridge />
      <MobileVoiceEditAssistant />
      <MobileAutoPdfPreview />
      <MobileUnifiedQuoteSheet />
      <MobilePhilippeQuoteActionsMenu />
      <MobileQuotePreviewInteractions />
      <MobileAccountingAction />
      <MobileCommercialDemo />
      <MobileElectronicInvoicingReadiness />
    </>
  );
}
