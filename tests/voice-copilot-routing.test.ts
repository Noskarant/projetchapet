import test from "node:test";
import assert from "node:assert/strict";
import { isStandaloneTradeAnalysis } from "../lib/voice-copilot-routing";

test("le chiffrage métier s'ouvre sans détour, une demande multi-actions reste un plan", () => {
  assert.equal(isStandaloneTradeAnalysis("Analyse ce chantier de rénovation"), true);
  assert.equal(isStandaloneTradeAnalysis("Chiffre les travaux de peinture"), true);
  assert.equal(isStandaloneTradeAnalysis("Crée le chantier Dupont et chiffre le devis"), false);
  assert.equal(isStandaloneTradeAnalysis("Crée un chantier et assigne Lucas"), false);
});
