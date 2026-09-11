"use client";

export default function MobileCopilotLauncherGuard() {
  return (
    <style>{`
      @media (max-width: 820px) {
        .mcp-launcher {
          display: none !important;
        }
      }
    `}</style>
  );
}
