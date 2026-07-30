import RappidosMobileShell from "./rappidos-mobile-shell";
import DefaultMobileTab from "./default-mobile-tab";
import MobileAiAssistantV3 from "./mobile-ai-assistant-v3";
import MobileDetailActions from "./mobile-detail-actions";
import MobileAccentActionFix from "./mobile-accent-action-fix";
import FunctionalPrototype from "./functional-prototype";
import ProductEnhancements from "./product-enhancements";
import AiChain from "./ai-chain";
import AiRecordingHotfix from "./ai-recording-hotfix";
import DocumentWorkflow from "./document-workflow";
import DocumentPreviewBridge from "./document-preview-bridge";
import DashboardEnhancements from "./dashboard-enhancements";
import MobileQuickAi from "./mobile-quick-ai";

export default function Page() {
  return (
    <>
      <RappidosMobileShell />
      <DefaultMobileTab />
      <MobileAiAssistantV3 />
      <MobileDetailActions />
      <MobileAccentActionFix />
      <FunctionalPrototype />
      <ProductEnhancements />
      <AiChain />
      <AiRecordingHotfix />
      <DocumentWorkflow />
      <DocumentPreviewBridge />
      <DashboardEnhancements />
      <MobileQuickAi />
    </>
  );
}
