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
  assert.equal(resolveCopilotTrade("metier_inconnu"), null);
});

test("la détection de compatibilité ne détourne pas les dictées peinture", () => {
  assert.equal(
    detectCopilotTradeFromDescription("Repeindre 45 m² de murs et 20 m² de plafonds avec deux portes."),
    "interior_painting",
  );
  assert.equal(
    detectCopilotTradeFromDescription("Deux fauteuils Voltaire en garniture traditionnelle avec passementerie."),
    "upholstery_decorator",
  );
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

test("le catalogue d’onboarding est large mais distingue clairement les packs réellement disponibles", () => {
  assert.ok(ARTISAN_TRADE_CATALOG.length >= 50);
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "electricien"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "plombier"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "menuisier"));
  assert.ok(ARTISAN_TRADE_CATALOG.some((trade) => trade.id === "tapissier_decorateur" && trade.availability === "beta"));

  const available = listAvailableCopilotTradePacks();
  assert.deepEqual(available.map((item) => item.trade).sort(), ["interior_painting", "upholstery_decorator"]);
  assert.equal(searchArtisanTrades("tapisserie")[0]?.id, "tapissier_decorateur");
});
