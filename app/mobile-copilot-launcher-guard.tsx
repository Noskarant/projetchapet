"use client";

export default function MobileCopilotLauncherGuard() {
  return (
    <style>{`
      @media (max-width: 1023px), (max-width: 1400px) and (any-pointer: coarse) {
        .mcp-launcher {
          display: none !important;
        }
      }
    `}</style>
  );
}
