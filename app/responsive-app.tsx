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
import FunctionalPrototype from "./functional-prototype";
import MobilePrototypeGate from "./mobile-prototype-gate";
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
    <AppErrorBoundary>
      <PwaRegister />
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
    </AppErrorBoundary>
  );
}
