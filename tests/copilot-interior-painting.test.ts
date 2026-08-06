import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInteriorPaintingProposal,
  interpretInteriorPaintingDescription,
} from "../lib/copilot/interior-painting";
import { normalizeInteriorPaintingAiInterpretation } from "../lib/copilot/ai-normalization";

test("comprend un chantier de peinture et rend ses hypothèses visibles", () => {
  const interpretation = interpretInteriorPaintingDescription(
    "Je dois repeindre un appartement de 65 m² avec les plafonds, quelques fissures et quatre portes chez M. Dupont.",
  );

  assert.equal(interpretation.trade, "interior_painting");
  assert.equal(interpretation.customerHint, "Dupont");
  assert.equal(interpretation.facts.floorAreaM2, 65);
  assert.equal(interpretation.facts.wallAreaM2, 156);
  assert.equal(interpretation.facts.ceilingAreaM2, 65);
  assert.equal(interpretation.facts.doorCount, 4);
  assert.equal(interpretation.facts.hasCracks, true);
  assert.equal(interpretation.missingInformation.length, 0);
  assert.ok(interpretation.assumptions.some((item) => item.includes("coefficient 2,4")));
});

test("le moteur calcule les lignes et la marge sans laisser l IA décider des totaux", () => {
  const interpretation = interpretInteriorPaintingDescription(
    "Peinture de 45 m² de murs et 20 m² de plafonds avec deux portes et quelques fissures.",
  );
  const proposal = buildInteriorPaintingProposal(interpretation, {
    settings: { hourlyCost: 30, targetMarginRate: 30, includeTravelFee: false },
  });

  assert.equal(proposal.status, "ready_for_review");
  assert.ok(proposal.lines.some((line) => line.code === "wall_paint_2_coats" && line.quantity === 45));
  assert.ok(proposal.lines.some((line) => line.code === "ceiling_paint_2_coats" && line.quantity === 20));
  assert.ok(proposal.lines.some((line) => line.code === "door_paint" && line.quantity === 2));
  assert.ok(proposal.lines.every((line) => line.saleTotalHt === Math.round(line.quantity * line.unitPriceHt * 100) / 100));
  assert.ok(proposal.metrics.saleTotalHt > proposal.metrics.estimatedCost);
  assert.equal(proposal.metrics.marginRate, Math.round((proposal.metrics.estimatedMargin / proposal.metrics.saleTotalHt) * 1000) / 10);
});

test("un tarif entreprise remplace le tarif générique et conserve son origine", () => {
  const interpretation = interpretInteriorPaintingDescription("Peindre 30 m² de murs.");
  const proposal = buildInteriorPaintingProposal(interpretation, {
    catalog: [
      {
        code: "wall_paint_2_coats",
        label: "Peinture murale entreprise",
        description: "Tarif validé par l’entreprise.",
        unit: "m2",
        unitPriceHt: 34,
        materialCostPerUnit: 5.5,
        labourHoursPerUnit: 0.2,
        taxRate: 10,
        source: "company_catalog",
      },
    ],
  });

  const wall = proposal.lines.find((line) => line.code === "wall_paint_2_coats");
  assert.equal(wall?.unitPriceHt, 34);
  assert.equal(wall?.source, "company_catalog");
  assert.equal(wall?.sourceLabel, "Tarif du catalogue de l’entreprise");
});

test("refuse de présenter un devis complet lorsque les quantités manquent", () => {
  const interpretation = interpretInteriorPaintingDescription("Je dois refaire une peinture intérieure chez Mme Martin.");
  const proposal = buildInteriorPaintingProposal(interpretation);

  assert.equal(proposal.status, "needs_information");
  assert.equal(proposal.lines.length, 0);
  assert.ok(proposal.questions.some((item) => item.includes("surface de murs")));
});

test("normalise la compréhension IA mais garde les calculs déterministes", () => {
  const interpretation = normalizeInteriorPaintingAiInterpretation(
    "Repeindre l appartement de Mme Lopez avec les murs, les plafonds et trois portes.",
    {
      customer_hint: "Mme Lopez",
      title: "Peinture complète appartement",
      facts: {
        floor_area_m2: 50,
        wall_area_m2: 118,
        ceiling_area_m2: 50,
        door_count: 3,
        has_cracks: false,
        include_walls: true,
        include_ceilings: true,
        include_doors: true,
      },
      confidence: 0.94,
    },
  );
  const proposal = buildInteriorPaintingProposal(interpretation);

  assert.equal(interpretation.customerHint, "Mme Lopez");
  assert.equal(interpretation.facts.wallAreaM2, 118);
  assert.equal(interpretation.facts.ceilingAreaM2, 50);
  assert.equal(interpretation.facts.doorCount, 3);
  assert.equal(proposal.status, "ready_for_review");
  assert.ok(proposal.lines.some((line) => line.code === "wall_paint_2_coats" && line.quantity === 118));
});
