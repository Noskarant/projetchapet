import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./prototype.css";
import "./crud.css";

export const metadata: Metadata = {
  title: "Projet Chapet — gestion bâtiment",
  description: "Prototype professionnel de devis, factures et pilotage pour les entreprises du bâtiment.",
  applicationName: "Projet Chapet",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#102a43",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
