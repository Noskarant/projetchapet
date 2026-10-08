"use client";


import ActionVoiceAssistant from "./action-voice-assistant";
import AppErrorBoundary from "./app-error-boundary";
import AuthenticatedEmailFetchBridge from "./authenticated-email-fetch-bridge";
import DocumentEmailSmsNotification from './document-email-sms-notification';
import CompanyProfileSettings from "./company-profile-settings";
import DesktopExerciseBridge from "./desktop-exercise-bridge";
import FirstRunOnboarding from "./first-run-onboarding";
import GuidedFirstRunTour from "./guided-first-run-tour";
import ImportCenter from "./import-center";
import ManufeoBrandingBridge from "./manufeo-branding-bridge";
import ManufeoSplash from "./manufeo-splash";
import MobilePrototypeGate from "./mobile-prototype-gate";
import PilotAuthGate from "./pilot-auth-gate";
import PilotOperationsCenter from "./pilot-operations-center";
import PilotReadinessUiBridge from "./pilot-readiness-ui-bridge";
import ProductUiPolish from "./product-ui-polish";
import PwaRegister from "./pwa-register";


const AUTH_BYPASS = process.env.NEXT_PUBLIC_FORGEO_AUTH_BYPASS === "1";

export default function ResponsiveApp() {
  return (
    <AppErrorBoundary>
      <ManufeoSplash>
      <PwaRegister />
      <ManufeoBrandingBridge />
      <PilotAuthGate>
        <AuthenticatedEmailFetchBridge />
        <DocumentEmailSmsNotification />
        <PilotReadinessUiBridge />
        <CompanyProfileSettings />
        <ImportCenter />
        {!AUTH_BYPASS && <ActionVoiceAssistant />}
        {!AUTH_BYPASS && <FirstRunOnboarding />}
        {!AUTH_BYPASS && <GuidedFirstRunTour />}
        {!AUTH_BYPASS && <PilotOperationsCenter />}
        <DesktopExerciseBridge />
        <ProductUiPolish />
        <MobilePrototypeGate />
      </PilotAuthGate>
      </ManufeoSplash>
    </AppErrorBoundary>
  );
}
