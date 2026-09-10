import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MANUFEO",
    short_name: "MANUFEO",
    description: "Gestion de devis, factures, clients et chantiers pour les artisans du bâtiment.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbf8f1",
    theme_color: "#102922",
    lang: "fr-FR",
    icons: [
      { src: "/icon-192.webp", sizes: "192x192", type: "image/webp", purpose: "maskable" },
      { src: "/icon-512.webp", sizes: "512x512", type: "image/webp", purpose: "maskable" },
    ],
  };
}
