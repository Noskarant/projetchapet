"use client";

import { useEffect, useState } from "react";
import AiChain from "./ai-chain";
import AiRecordingHotfix from "./ai-recording-hotfix";
import AppErrorBoundary from "./app-error-boundary";
import CompanyProfileSettings from "./company-profile-settings";
import DashboardEnhancements from "./dashboard-enhancements";
import DesktopExerciseBridge from "./desktop-exercise-bridge";
import DocumentPreviewBridge from "./document-preview-bridge";
import DocumentWorkflow from "./document-workflow";
import ForgeoPublicGate from "./forgeo-public-gate";
import FunctionalPrototype from "./functional-prototype";
import MobilePrototypeGate from "./mobile-prototype-gate";
import PilotAuthGate from "./pilot-auth-gate";
import ProductEnhancements from "./product-enhancements";
import PwaRegister from "./pwa-register";

type InterfaceMode = "mobile" | "desktop";

export default function ResponsiveApp() {
  const [mode, setMode] = useState<InterfaceMode | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const synchronize = () => setMode(media.matches ? "mobile" : "desktop");
    synchronize();
    media.addEventListener("change", synchronize);
    return () => media.removeEventListener("change", synchronize);
  }, []);

  if (!mode) {
    return <main aria-label="Chargement de FORGEO" style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#f3efe6",color:"#102a3d",fontFamily:"Inter,system-ui,sans-serif",fontWeight:900,letterSpacing:".08em"}}>FORGEO</main>;
  }

  return (
    <AppErrorBoundary>
      <PwaRegister />
      <ForgeoPublicGate>
        <PilotAuthGate>
          <CompanyProfileSettings />
          <DesktopExerciseBridge />
          {mode === "mobile" ? (
            <MobilePrototypeGate />
          ) : (
            <>
              <FunctionalPrototype />
              <ProductEnhancements />
              <AiChain />
              <AiRecordingHotfix />
              <DocumentWorkflow />
              <DocumentPreviewBridge />
              <DashboardEnhancements />
            </>
          )}
        </PilotAuthGate>
      </ForgeoPublicGate>
    </AppErrorBoundary>
  );
}
