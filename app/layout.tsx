import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./prototype.css";
import "./crud.css";
import "./readability-enhancements.css";
import "./ai-chain.css";
import "./workflow-polish.css";
import "./document-preview.css";
import "./dashboard-enhancements.css";
import "./mobile-quick-ai.css";
import "./mobile-visibility-force.css";
import "./mobile-card-sizing.css";
import "./rappidos-mobile-shell.css";
import "./mobile-ai-assistant.css";
import "./mobile-detail-actions.css";
import "./mobile-app-v2.css";
import "./mobile-priority-polish.css";
import "./mobile-document-flow.css";

export const metadata: Metadata = {
  title: "Projet Chapet — gestion bâtiment",
  description: "Prototype professionnel de devis, factures et pilotage pour les entreprises du bâtiment.",
  applicationName: "Projet Chapet",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.svg",
    apple: "/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Projet Chapet",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#030919",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
