import RappidosMobileShellV2 from "./rappidos-mobile-shell-v2";
import MobileAiAssistantV4 from "./mobile-ai-assistant-v4";
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
      <MobileAiAssistantV4 />
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
