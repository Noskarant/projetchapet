"use client";

export default function MobileCopilotLauncherGuard() {
  return (
    <style>{`
      @media all {
        .mcp-launcher {
          display: none !important;
        }
      }
    `}</style>
  );
}
