import type { Metadata, Viewport } from "next";
import MarketPricingExperience from "./market-pricing-experience";
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
import "./mobile-quote-preview.css";
import "./mobile-quote-preview-scroll-fix.css";
import "./mobile-status-colors.css";
import "./mobile-commercial-demo.css";
import "./mobile-premium-polish.css";
import "./public-auth-redesign.css";
import "./product-ui-polish.css";

export const metadata: Metadata = {
  title: "FORGEO — gestion simple pour artisans du bâtiment",
  description: "Devis, factures, clients et suivi de chantier dans un outil pensé pour les artisans du bâtiment.",
  applicationName: "FORGEO",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.svg",
    apple: "/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FORGEO",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0875f5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}<MarketPricingExperience /></body>
    </html>
  );
}
