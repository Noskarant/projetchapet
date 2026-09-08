import assert from "node:assert/strict";
import test from "node:test";
import { findMarketPriceReferences } from "../lib/forgeo-market-pricing";

test("propose les trois niveaux sourcés pour une peinture murale", () => {
  const result = findMarketPriceReferences("Peindre 42 m² de murs du séjour");
  const painting = result.find((item) => item.id === "painting_wall_2026");
  assert.ok(painting);
  assert.equal(painting.low, 20);
  assert.equal(painting.market, 28);
  assert.equal(painting.comfortable, 35);
  assert.equal(painting.basis, "TTC");
  assert.match(painting.sourceUrl, /^https:\/\//);
});

test("ne confond pas peinture de façade et peinture intérieure", () => {
  const result = findMarketPriceReferences("Peinture de façade extérieure");
  assert.equal(result.some((item) => item.id === "painting_wall_2026"), false);
});

test("distingue location et montage échafaudage", () => {
  const rental = findMarketPriceReferences("Prévoir location échafaudage fixe");
  assert.ok(rental.some((item) => item.id === "scaffold_rental_fixed_2026"));
  assert.equal(rental.some((item) => item.id === "scaffold_mounting_2026"), false);

  const mounting = findMarketPriceReferences("Prévoir montage échafaudage pour le pignon");
  assert.ok(mounting.some((item) => item.id === "scaffold_mounting_2026"));
  assert.equal(mounting.some((item) => item.id === "scaffold_rental_fixed_2026"), false);
});

test("signale Lyon sans inventer de coefficient régional", () => {
  const result = findMarketPriceReferences("Doublage placo standard à Lyon");
  assert.equal(result.length, 1);
  assert.match(result[0].regionalNote ?? "", /aucune majoration automatique/i);
  assert.equal(result[0].market, 55);
});

test("ne propose aucun prix quand aucune prestation couverte n'est reconnue", () => {
  assert.deepEqual(findMarketPriceReferences("Remplacer un tableau électrique triphasé"), []);
});
