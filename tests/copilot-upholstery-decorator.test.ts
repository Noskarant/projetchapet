import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpholsteryDecoratorProposal,
  interpretUpholsteryDecoratorDescription,
} from "../lib/copilot/upholstery-decorator";
import type { CopilotCatalogService } from "../lib/copilot/types";

const COMPANY_CATALOG: CopilotCatalogService[] = [
  {
    code: "upholstery_stripping",
    label: "Dégarnissage atelier",
    description: "Dégarnissage validé par l’atelier.",
    unit: "unite",
    unitPriceHt: 120,
    materialCostPerUnit: 5,
    labourHoursPerUnit: 2,
    taxRate: 20,
    source: "company_catalog",
  },
  {
    code: "upholstery_traditional_rebuild",
    label: "Garniture traditionnelle atelier",
    description: "Garniture traditionnelle au tarif atelier.",
    unit: "unite",
    unitPriceHt: 420,
    materialCostPerUnit: 90,
    labourHoursPerUnit: 7,
    taxRate: 20,
    source: "company_catalog",
  },
  {
    code: "upholstery_covering",
    label: "Couverture atelier",
    description: "Couverture avec tissu fourni par le client.",
    unit: "unite",
    unitPriceHt: 180,
    materialCostPerUnit: 15,
    labourHoursPerUnit: 3,
    taxRate: 20,
    source: "company_catalog",
  },
  {
    code: "upholstery_trim_finish",
    label: "Passementerie atelier",
    description: "Finition passementerie au tarif atelier.",
    unit: "unite",
    unitPriceHt: 55,
    materialCostPerUnit: 18,
    labourHoursPerUnit: 0.75,
    taxRate: 20,
    source: "company_catalog",
  },
  {
    code: "upholstery_transport",
    label: "Livraison atelier",
    description: "Retour du mobilier chez le client.",
    unit: "forfait",
    unitPriceHt: 65,
    materialCostPerUnit: 18,
    labourHoursPerUnit: 0.75,
    taxRate: 20,
    source: "company_catalog",
  },
];

const REALISTIC_DESCRIPTION =
  "Deux fauteuils Voltaire, dégarnissage complet, garniture traditionnelle, le client fournit le tissu, je change la passementerie et je les lui ramène.";

test("comprend une dictée réaliste de tapissier décorateur sans inventer de métrage", () => {
  const interpretation = interpretUpholsteryDecoratorDescription(REALISTIC_DESCRIPTION);

  assert.equal(interpretation.trade, "upholstery_decorator");
  assert.equal(interpretation.facts.itemKind, "fauteuil");
  assert.equal(interpretation.facts.itemCount, 2);
  assert.equal(interpretation.facts.itemLabel, "Fauteuil Voltaire");
  assert.equal(interpretation.facts.technique, "traditionnelle");
  assert.equal(interpretation.facts.includeStripping, true);
  assert.equal(interpretation.facts.includeUpholsteryWork, true);
  assert.equal(interpretation.facts.includeCovering, true);
  assert.equal(interpretation.facts.fabricProvidedBy, "client");
  assert.equal(interpretation.facts.fabricMeters, null);
  assert.equal(interpretation.facts.includeTrim, true);
  assert.equal(interpretation.facts.trimProvidedBy, "artisan");
  assert.equal(interpretation.facts.includeDelivery, true);
  assert.equal(interpretation.missingInformation.length, 0);
});

test("ne crée pas un devis prêt tant que les vrais tarifs entreprise manquent", () => {
  const interpretation = interpretUpholsteryDecoratorDescription(REALISTIC_DESCRIPTION);
  const proposal = buildUpholsteryDecoratorProposal(interpretation);

  assert.equal(proposal.status, "needs_information");
  assert.ok(proposal.lines.length >= 4);
  assert.ok(proposal.lines.every((line) => line.unitPriceHt === 0));
  assert.ok(proposal.questions.some((question) => question.includes("tarif entreprise")));
  assert.equal(proposal.metrics.saleTotalHt, 0);
});

test("utilise uniquement les tarifs validés de l’entreprise et calcule les totaux de façon déterministe", () => {
  const interpretation = interpretUpholsteryDecoratorDescription(REALISTIC_DESCRIPTION);
  const proposal = buildUpholsteryDecoratorProposal(interpretation, {
    catalog: COMPANY_CATALOG,
    settings: { hourlyCost: 30, targetMarginRate: 25 },
  });

  assert.equal(proposal.status, "ready_for_review");
  assert.equal(proposal.lines.length, 5);
  assert.ok(proposal.lines.every((line) => line.source === "company_catalog"));
  assert.ok(proposal.lines.every((line) => line.saleTotalHt === Math.round(line.quantity * line.unitPriceHt * 100) / 100));
  assert.equal(proposal.metrics.saleTotalHt, 1615);
  assert.ok(proposal.metrics.estimatedCost > 0);
  assert.equal(proposal.questions.length, 0);
});

test("demande les informations métier critiques au lieu de les déduire", () => {
  const interpretation = interpretUpholsteryDecoratorDescription(
    "Je dois refaire un fauteuil avec un nouveau tissu.",
  );

  assert.equal(interpretation.facts.fabricProvidedBy, "unknown");
  assert.equal(interpretation.facts.fabricMeters, null);
  assert.ok(interpretation.missingInformation.some((item) => item.includes("technique de garniture")));
  assert.ok(interpretation.missingInformation.some((item) => item.includes("tissu est fourni")));
});
