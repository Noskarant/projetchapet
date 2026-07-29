import FunctionalPrototype from "./functional-prototype";
import ProductEnhancements from "./product-enhancements";
import AiChain from "./ai-chain";
import AiRecordingHotfix from "./ai-recording-hotfix";
import DocumentWorkflow from "./document-workflow";
import DocumentPreviewBridge from "./document-preview-bridge";

export default function Page() {
  return (
    <>
      <FunctionalPrototype />
      <ProductEnhancements />
      <AiChain />
      <AiRecordingHotfix />
      <DocumentWorkflow />
      <DocumentPreviewBridge />
    </>
  );
}
