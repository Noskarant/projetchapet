import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atelio",
    short_name: "Atelio",
    description: "Devis, factures et pilotage pour les artisans.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f1",
    theme_color: "#102922",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
