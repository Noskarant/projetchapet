import type { CopilotTrade } from "./types";

export type ArtisanTradeCategory =
  | "batiment"
  | "amenagement_decoration"
  | "bois_metal_fabrication"
  | "exterieur"
  | "reparation_services"
  | "mode_art"
  | "alimentation";

export type ArtisanTradeAvailability = "available" | "beta" | "planned";

export type ArtisanTradeDefinition = {
  id: string;
  label: string;
  category: ArtisanTradeCategory;
  aliases: string[];
  availability: ArtisanTradeAvailability;
  packTrade?: CopilotTrade;
  quoteWorkflowFit: "core" | "secondary";
};

export const ARTISAN_TRADE_CATALOG: ArtisanTradeDefinition[] = [
  { id: "peintre", label: "Peintre / plâtrier-peintre", category: "batiment", aliases: ["peinture", "peintre en bâtiment", "plâtrier-peintre"], availability: "available", packTrade: "interior_painting", quoteWorkflowFit: "core" },
  { id: "tapissier_decorateur", label: "Tapissier décorateur / tapissier d’ameublement", category: "amenagement_decoration", aliases: ["tapissier", "tapissier ameublement", "tapisserie siège"], availability: "beta", packTrade: "upholstery_decorator", quoteWorkflowFit: "core" },
  { id: "plaquiste", label: "Plaquiste", category: "batiment", aliases: ["placo", "plaque de plâtre"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "platrier", label: "Plâtrier", category: "batiment", aliases: ["plâtre", "staff"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "macon", label: "Maçon", category: "batiment", aliases: ["maçonnerie", "gros œuvre"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "carreleur", label: "Carreleur / mosaïste", category: "batiment", aliases: ["carrelage", "mosaïque"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "solier", label: "Solier / poseur de sols", category: "batiment", aliases: ["sol souple", "vinyle", "moquette"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "parqueteur", label: "Parqueteur", category: "amenagement_decoration", aliases: ["parquet", "pose parquet"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "plombier", label: "Plombier", category: "batiment", aliases: ["plomberie", "sanitaire"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "chauffagiste", label: "Chauffagiste", category: "batiment", aliases: ["chauffage", "chaudière", "pompe à chaleur"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "climaticien", label: "Climaticien / frigoriste", category: "batiment", aliases: ["climatisation", "frigoriste", "PAC air-air"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "electricien", label: "Électricien", category: "batiment", aliases: ["électricité", "installation électrique"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "domoticien", label: "Domoticien / intégrateur smart home", category: "batiment", aliases: ["domotique", "maison connectée"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "menuisier", label: "Menuisier", category: "bois_metal_fabrication", aliases: ["menuiserie", "menuisier bois"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "agenceur", label: "Agenceur / menuisier-agenceur", category: "amenagement_decoration", aliases: ["agencement", "mobilier sur mesure"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "ebeniste", label: "Ébéniste", category: "bois_metal_fabrication", aliases: ["ébénisterie", "meuble sur mesure"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "charpentier", label: "Charpentier", category: "batiment", aliases: ["charpente", "charpente bois"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "couvreur", label: "Couvreur", category: "batiment", aliases: ["couverture", "toiture"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "zingueur", label: "Zingueur", category: "batiment", aliases: ["zinguerie", "gouttière"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "etancheur", label: "Étancheur", category: "batiment", aliases: ["étanchéité", "toiture terrasse"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "facadier", label: "Façadier / enduiseur", category: "batiment", aliases: ["façade", "ravalement", "enduit extérieur"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "isolation", label: "Artisan isolation", category: "batiment", aliases: ["isolation thermique", "ITE", "combles"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "serrurier", label: "Serrurier", category: "bois_metal_fabrication", aliases: ["serrurerie", "serrure"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "metallier", label: "Métallier", category: "bois_metal_fabrication", aliases: ["métallerie", "acier", "inox"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "ferronnier", label: "Ferronnier d’art", category: "bois_metal_fabrication", aliases: ["ferronnerie", "fer forgé"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "vitrier", label: "Vitrier / miroitier", category: "batiment", aliases: ["vitrerie", "miroiterie", "vitrage"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "storiste", label: "Storiste / installateur de protections solaires", category: "amenagement_decoration", aliases: ["store", "volet", "pergola"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "cuisiniste", label: "Cuisiniste / poseur de cuisines", category: "amenagement_decoration", aliases: ["cuisine", "pose cuisine"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "marbrier", label: "Marbrier", category: "bois_metal_fabrication", aliases: ["marbre", "pierre naturelle"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "tailleur_pierre", label: "Tailleur de pierre", category: "bois_metal_fabrication", aliases: ["taille de pierre", "pierre"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "terrassier", label: "Terrassier", category: "exterieur", aliases: ["terrassement", "VRD"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "paysagiste", label: "Paysagiste", category: "exterieur", aliases: ["aménagement paysager", "jardin"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "jardinier", label: "Jardinier", category: "exterieur", aliases: ["entretien jardin", "espaces verts"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "elagueur", label: "Élagueur / arboriste", category: "exterieur", aliases: ["élagage", "abattage"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "pisciniste", label: "Pisciniste", category: "exterieur", aliases: ["piscine", "spa"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "cloturiste", label: "Poseur de clôtures / portails", category: "exterieur", aliases: ["clôture", "portail"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "ramoneur", label: "Ramoneur", category: "reparation_services", aliases: ["ramonage", "conduit"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "fumiste", label: "Fumiste / installateur de poêles", category: "batiment", aliases: ["poêle", "cheminée", "conduit fumée"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "restaurateur_mobilier", label: "Restaurateur de mobilier", category: "amenagement_decoration", aliases: ["restauration meuble", "antiquaire restaurateur"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "sellier", label: "Sellier / sellier-garnisseur", category: "mode_art", aliases: ["sellerie", "sellerie automobile"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "couturier", label: "Couturier / retoucheur", category: "mode_art", aliases: ["couture", "retouche"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "maroquinier", label: "Maroquinier", category: "mode_art", aliases: ["maroquinerie", "cuir"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "cordonnier", label: "Cordonnier", category: "reparation_services", aliases: ["cordonnerie", "réparation chaussures"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "bijoutier", label: "Bijoutier / joaillier", category: "mode_art", aliases: ["bijouterie", "joaillerie"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "horloger", label: "Horloger", category: "reparation_services", aliases: ["horlogerie", "montre"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "ceramiste", label: "Céramiste / potier", category: "mode_art", aliases: ["céramique", "poterie"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "verrier", label: "Verrier / vitrailliste", category: "mode_art", aliases: ["verre", "vitrail"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "graveur", label: "Graveur", category: "mode_art", aliases: ["gravure"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "encadreur", label: "Encadreur", category: "mode_art", aliases: ["encadrement", "cadre"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "doreur", label: "Doreur / restaurateur", category: "mode_art", aliases: ["dorure", "restauration dorure"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "mecanicien", label: "Mécanicien automobile / moto", category: "reparation_services", aliases: ["mécanique", "garage"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "carrossier", label: "Carrossier / peintre automobile", category: "reparation_services", aliases: ["carrosserie", "peinture auto"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "reparateur_electromenager", label: "Réparateur électroménager", category: "reparation_services", aliases: ["dépannage électroménager", "SAV"], availability: "planned", quoteWorkflowFit: "core" },
  { id: "reparateur_cycles", label: "Réparateur de cycles", category: "reparation_services", aliases: ["vélo", "cycle", "réparation vélo"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "boulanger", label: "Boulanger", category: "alimentation", aliases: ["boulangerie"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "patissier", label: "Pâtissier", category: "alimentation", aliases: ["pâtisserie", "gâteau"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "chocolatier", label: "Chocolatier / confiseur", category: "alimentation", aliases: ["chocolaterie", "confiserie"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "boucher_charcutier", label: "Boucher / charcutier", category: "alimentation", aliases: ["boucherie", "charcuterie"], availability: "planned", quoteWorkflowFit: "secondary" },
  { id: "traiteur", label: "Traiteur", category: "alimentation", aliases: ["réception", "buffet"], availability: "planned", quoteWorkflowFit: "core" },
];

export function getArtisanTradeDefinition(id: string) {
  return ARTISAN_TRADE_CATALOG.find((trade) => trade.id === id) ?? null;
}

export function searchArtisanTrades(query: string) {
  const normalized = query.trim().toLocaleLowerCase("fr-FR");
  if (!normalized) return ARTISAN_TRADE_CATALOG;
  return ARTISAN_TRADE_CATALOG.filter((trade) =>
    trade.label.toLocaleLowerCase("fr-FR").includes(normalized)
    || trade.aliases.some((alias) => alias.toLocaleLowerCase("fr-FR").includes(normalized)),
  );
}
