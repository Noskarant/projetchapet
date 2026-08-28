import assert from "node:assert/strict";
import test from "node:test";
import { getCopilotTradePack, listAvailableCopilotTradePacks } from "../lib/copilot/trade-packs";
import type { CopilotCatalogService, CopilotTrade, StructuredTradeInterpretation } from "../lib/copilot/types";

function structuredServices(trade: CopilotTrade, description: string) {
  const interpretation = getCopilotTradePack(trade).interpretLocal(description);
  assert.equal(interpretation.trade, trade);
  assert.equal(interpretation.jobType, "structured_trade_job");
  return (interpretation as StructuredTradeInterpretation).facts.services;
}

function expectService(
  services: ReturnType<typeof structuredServices>,
  code: string,
  quantity: number | null,
) {
  const service = services.find((item) => item.serviceCode === code);
  assert.ok(service, `Prestation ${code} absente`);
  assert.equal(service.quantity, quantity, `Quantité incorrecte pour ${code}`);
}

function pricedCatalog(trade: CopilotTrade) {
  return getCopilotTradePack(trade).defaultCatalog.map((service, index): CopilotCatalogService => ({
    ...service,
    unitPriceHt: 50 + index * 10,
    materialCostPerUnit: 10 + index,
    labourHoursPerUnit: 0.5 + index * 0.1,
    source: "company_catalog",
  }));
}

test("les dix packs métier sont enregistrés dans une seule application", () => {
  const trades = listAvailableCopilotTradePacks().map((item) => item.trade);
  assert.deepEqual(new Set(trades), new Set([
    "interior_painting",
    "upholstery_decorator",
    "plumbing_heating",
    "electrician",
    "carpentry_joinery",
    "tiling_flooring",
    "roofing",
    "masonry",
    "landscaping",
    "locksmith_metalwork",
  ]));
});

test("plombier/chauffagiste : plusieurs postes, unités et quantité linéaire", () => {
  const trade = "plumbing_heating" as const;
  const description = "Chez Mme Arnaud, je remplace 2 WC, je pose 3 radiateurs, je tire 18 m de multicouche et je fais aussi une recherche de fuite dans la cuisine.";
  const services = structuredServices(trade, description);
  expectService(services, "plumbing_fixture", 2);
  expectService(services, "heating_radiator", 3);
  expectService(services, "plumbing_pipe", 18);
  expectService(services, "plumbing_repair", 1);

  const proposal = getCopilotTradePack(trade).buildProposal(getCopilotTradePack(trade).interpretLocal(description), { catalog: pricedCatalog(trade) });
  assert.equal(proposal.status, "ready_for_review");
  assert.ok(proposal.metrics.saleTotalHt > 0);
});

test("électricien : auto-correction orale et plusieurs familles de travaux", () => {
  const trade = "electrician" as const;
  const description = "Chez SCI Ampère : 6 prises, attends non 8 prises 2P+T, 4 DCL, 2 circuits dédiés, un tableau électrique et 45 m de gaine ICTA.";
  const services = structuredServices(trade, description);
  expectService(services, "electrical_socket", 8);
  expectService(services, "electrical_light", 4);
  expectService(services, "electrical_circuit", 2);
  expectService(services, "electrical_panel", 1);
  expectService(services, "electrical_cable", 45);
});

test("menuisier/agenceur : menuiseries, mobilier et métrés linéaires", () => {
  const trade = "carpentry_joinery" as const;
  const description = "Pour M. Bernard : 3 fenêtres à remplacer, un dressing sur mesure, plan de travail 4,2 m et 17 m de plinthes avec ajustage en fin de pose.";
  const services = structuredServices(trade, description);
  expectService(services, "joinery_opening", 3);
  expectService(services, "joinery_custom_furniture", 1);
  expectService(services, "joinery_worktop", 4.2);
  expectService(services, "joinery_skirting", 17);
  expectService(services, "joinery_installation", 1);
});

test("carreleur/solier : surfaces, étanchéité, préparation et plinthes", () => {
  const trade = "tiling_flooring" as const;
  const description = "Salle de bain : 42 m2 de carrelage au sol, 18 m2 de faïence, ragréage 42 m2, SPEC 8 m2 et 31 m de plinthes.";
  const services = structuredServices(trade, description);
  expectService(services, "floor_tiling", 42);
  expectService(services, "wall_tiling", 18);
  expectService(services, "floor_preparation", 42);
  expectService(services, "floor_waterproofing", 8);
  expectService(services, "floor_skirting", 31);
});

test("couvreur/zingueur : couverture, détails de toiture et accès", () => {
  const trade = "roofing" as const;
  const description = "Réfection : 120 m2 de tuiles, 14 m de faîtage, 26 m de gouttière zinc, 6 m de solin, 2 Velux et échafaudage.";
  const services = structuredServices(trade, description);
  expectService(services, "roof_covering", 120);
  expectService(services, "roof_ridge", 14);
  expectService(services, "roof_gutter", 26);
  expectService(services, "roof_flashing", 6);
  expectService(services, "roof_window", 2);
  expectService(services, "roof_scaffolding", 1);
});

test("maçon : mur, dalle, chape, ouverture et fondation", () => {
  const trade = "masonry" as const;
  const description = "35 m2 de mur en parpaing, dalle béton 28 m2, chape 28 m2, création de 2 ouvertures avec linteaux et 12 m de semelle filante.";
  const services = structuredServices(trade, description);
  expectService(services, "masonry_wall", 35);
  expectService(services, "masonry_slab", 28);
  expectService(services, "masonry_screed", 28);
  expectService(services, "masonry_opening", 2);
  expectService(services, "masonry_footing", 12);
});

test("paysagiste : surfaces, linéaires, végétaux et préparation de terrain", () => {
  const trade = "landscaping" as const;
  const description = "150 m2 de gazon, 25 m de haie, 12 arbustes à planter, terrasse pavée 30 m2, 40 m de clôture, élagage et terrassement léger.";
  const services = structuredServices(trade, description);
  expectService(services, "landscape_lawn", 150);
  expectService(services, "landscape_hedge", 25);
  expectService(services, "landscape_planting", 12);
  expectService(services, "landscape_paving", 30);
  expectService(services, "landscape_fence", 40);
  expectService(services, "landscape_pruning", 1);
  expectService(services, "landscape_earthwork", 1);
});

test("serrurier/métallier : dépannage, serrurerie et ouvrages linéaires", () => {
  const trade = "locksmith_metalwork" as const;
  const description = "Chez Durand, remplacement de 2 cylindres, ouverture d'une porte claquée, 8 m de garde-corps, 4 m de main courante et un portail acier.";
  const services = structuredServices(trade, description);
  expectService(services, "locksmith_lock", 2);
  expectService(services, "locksmith_emergency", 1);
  expectService(services, "metal_railing", 8);
  expectService(services, "metal_handrail", 4);
  expectService(services, "metal_gate", 1);
});

test("une mesure absente reste inconnue et bloque le devis au lieu d'être inventée", () => {
  const trade = "roofing" as const;
  const pack = getCopilotTradePack(trade);
  const interpretation = pack.interpretLocal("Il faut refaire la couverture en tuiles et reprendre la gouttière.") as StructuredTradeInterpretation;
  expectService(interpretation.facts.services, "roof_covering", null);
  expectService(interpretation.facts.services, "roof_gutter", null);
  const proposal = pack.buildProposal(interpretation, { catalog: pricedCatalog(trade) });
  assert.equal(proposal.status, "needs_information");
  assert.equal(proposal.lines.length, 0);
  assert.ok(proposal.questions.some((question) => question.includes("surface")));
  assert.ok(proposal.questions.some((question) => question.includes("métrage")));
});

test("une quantité proposée uniquement par l'IA n'est pas acceptée sans ancrage dans la dictée", () => {
  const trade = "electrician" as const;
  const pack = getCopilotTradePack(trade);
  const normalized = pack.normalizeAi("Je dois tirer de la gaine ICTA dans le logement.", {
    facts: { services: [{ service_code: "electrical_cable", quantity: 999, unit: "m", detail: "gaine" }] },
  }) as StructuredTradeInterpretation;
  expectService(normalized.facts.services, "electrical_cable", null);
});

test("les packs structurés refusent d'inventer des prix par défaut", () => {
  const trade = "locksmith_metalwork" as const;
  const pack = getCopilotTradePack(trade);
  const interpretation = pack.interpretLocal("Je remplace 2 cylindres chez le client.");
  const proposal = pack.buildProposal(interpretation);
  assert.equal(proposal.status, "needs_information");
  assert.equal(proposal.lines[0]?.unitPriceHt, 0);
  assert.ok(proposal.questions.some((question) => question.includes("tarif entreprise")));
});
