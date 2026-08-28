import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInteriorPaintingProposal,
  interpretInteriorPaintingDescription,
} from "../lib/copilot/interior-painting";
import { ARTISAN_TRADE_CATALOG, searchArtisanTrades } from "../lib/copilot/trade-catalog";
import { detectCopilotTradeFromDescription } from "../lib/copilot/trade-detection";
import {
  getCopilotTradePack,
  listAvailableCopilotTradePacks,
  resolveCopilotTrade,
} from "../lib/copilot/trade-packs";

test("le registre conserve la peinture comme métier historique par défaut", () => {
  assert.equal(resolveCopilotTrade(undefined), "interior_painting");
  assert.equal(resolveCopilotTrade("peintre"), "interior_painting");
  assert.equal(resolveCopilotTrade("tapissier"), "upholstery_decorator");
  assert.equal(resolveCopilotTrade("plombier"), "plumbing_heating");
  assert.equal(resolveCopilotTrade("électricien"), "electrician");
  assert.equal(resolveCopilotTrade("menuisier"), "carpentry_joinery");
  assert.equal(resolveCopilotTrade("carreleur"), "tiling_flooring");
  assert.equal(resolveCopilotTrade("couvreur"), "roofing");
  assert.equal(resolveCopilotTrade("maçon"), "masonry");
  assert.equal(resolveCopilotTrade("paysagiste"), "landscaping");
  assert.equal(resolveCopilotTrade("serrurier"), "locksmith_metalwork");
  assert.equal(resolveCopilotTrade("metier_inconnu"), null);
});

test("la détection de compatibilité route les dictées métier sans détourner la peinture", () => {
  assert.equal(detectCopilotTradeFromDescription("Repeindre 45 m² de murs et 20 m² de plafonds avec deux portes."), "interior_painting");
  assert.equal(detectCopilotTradeFromDescription("Deux fauteuils Voltaire en garniture traditionnelle avec passementerie."), "upholstery_decorator");
  assert.equal(detectCopilotTradeFromDescription("Je tire 25 m de multicouche et je pose deux radiateurs."), "plumbing_heating");
  assert.equal(detectCopilotTradeFromDescription("Huit prises 2P+T et quatre DCL avec reprise du tableau électrique."), "electrician");
  assert.equal(detectCopilotTradeFromDescription("Un dressing sur mesure avec plan de travail et plinthes."), "carpentry_joinery");
  assert.equal(detectCopilotTradeFromDescription("Carrelage au sol, faïence et ragréage dans la salle de bain."), "tiling_flooring");
  assert.equal(detectCopilotTradeFromDescription("Réfection toiture en tuiles avec faîtage, gouttière et Velux."), "roofing");
  assert.equal(detectCopilotTradeFromDescription("Mur en parpaing, dalle béton et semelle filante."), "masonry");
  assert.equal(detectCopilotTradeFromDescription("Engazonnement, haie, clôture et élagage dans le jardin."), "landscaping");
  assert.equal(detectCopilotTradeFromDescription("Remplacement du cylindre et fabrication d'un garde-corps acier."), "locksmith_metalwork");
});

test("le pack peinture reproduit exactement le moteur existant", () => {
  const description = "Peinture de 45 m² de murs et 20 m² de plafonds avec deux portes et quelques fissures.";
  const directInterpretation = interpretInteriorPaintingDescription(description);
  const directProposal = buildInteriorPaintingProposal(directInterpretation, {
    settings: { hourlyCost: 30, targetMarginRate: 30, includeTravelFee: false },
  });

  const pack = getCopilotTradePack("interior_painting");
  const packedInterpretation = pack.interpretLocal(description);
  const packedProposal = pack.buildProposal(packedInterpretation, {
    settings: { hourlyCost: 30, targetMarginRate: 30, includeTravelFee: false },
  });

  assert.deepEqual(packedInterpretation, directInterpretation);
  assert.deepEqual(packedProposal, directProposal);
});

test("le catalogue d’onboarding reste large et les dix packs réellement exécutables sont enregistrés", () => {
  assert.ok(ARTISAN_TRADE_CATALOG.length >= 50);
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "electricien"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "plombier"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "menuisier"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "tapissier_decorateur" && trade.availability === "beta"));

  const available = listAvailableCopilotTradePacks().map((item) => item.trade).sort();
  assert.deepEqual(available, [
    "carpentry_joinery",
    "electrician",
    "interior_painting",
    "landscaping",
    "locksmith_metalwork",
    "masonry",
    "plumbing_heating",
    "roofing",
    "tiling_flooring",
    "upholstery_decorator",
  ]);
  assert.equal(searchArtisanTrades("tapisserie")[0]?.id, "tapissier_decorateur");
});
