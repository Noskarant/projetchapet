import RappidosMobileShellV2 from "./rappidos-mobile-shell-v2";
import MobilePriorityPolish from "./mobile-priority-polish";
import MobileAiAssistantV5 from "./mobile-ai-assistant-v5";
import MobileAutoPdfPreview from "./mobile-auto-pdf-preview";
import MobileAccountingAction from "./mobile-accounting-action";
import FunctionalPrototype from "./functional-prototype";
import ProductEnhancements from "./product-enhancements";
import AiChain from "./ai-chain";
import AiRecordingHotfix from "./ai-recording-hotfix";
import DocumentWorkflow from "./document-workflow";
import DocumentPreviewBridge from "./document-preview-bridge";
import DashboardEnhancements from "./dashboard-enhancements";

export default function Page() {
  return (
    <>
      <RappidosMobileShellV2 />
      <MobilePriorityPolish />
      <MobileAiAssistantV5 />
      <MobileAutoPdfPreview />
      <MobileAccountingAction />
      <FunctionalPrototype />
      <ProductEnhancements />
      <AiChain />
      <AiRecordingHotfix />
      <DocumentWorkflow />
      <DocumentPreviewBridge />
      <DashboardEnhancements />
    </>
  );
}
