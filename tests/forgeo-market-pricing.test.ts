import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMarketPriceToQuoteItems,
  findMarketPriceReferences,
  getMarketPriceCatalogSize,
} from "../lib/forgeo-market-pricing";

type QuoteLine = { label?: string; quantity?: number | null; unit?: string | null; unit_price?: number | null; tax_rate?: number | null };

test("conserve le repère peinture v1 et ses trois niveaux", () => {
  const result = findMarketPriceReferences("Peindre 42 m² de murs du séjour");
  const painting = result.find((item) => item.id === "painting_wall_2026");
  assert.ok(painting);
  assert.equal(painting.low, 20);
  assert.equal(painting.market, 28);
  assert.equal(painting.comfortable, 35);
  assert.equal(painting.basis, "TTC");
  assert.match(painting.sourceUrl, /^https:\/\//);
});

test("catalogue 5.1 couvre au moins cinquante références BTP", () => {
  assert.ok(getMarketPriceCatalogSize() >= 50);
});

test("reconnaît plusieurs métiers sans mélanger les prestations", () => {
  assert.ok(findMarketPriceReferences("Réparer une fuite d'eau sous évier").some((item) => item.id === "plumbing_leak_repair_2026"));
  assert.ok(findMarketPriceReferences("Refaire la toiture en tuiles terre cuite").some((item) => item.id === "roof_clay_tile_2026"));
  assert.ok(findMarketPriceReferences("Créer une ouverture dans un mur porteur").some((item) => item.id === "masonry_load_bearing_opening_2026"));
  assert.ok(findMarketPriceReferences("Ravalement avec peinture de façade").some((item) => item.id === "facade_painting_2026"));
  assert.ok(findMarketPriceReferences("Poser une fenêtre PVC").some((item) => item.id === "window_pvc_installed_2026"));
  assert.ok(findMarketPriceReferences("Installer une pompe à chaleur air eau").some((item) => item.id === "heat_pump_air_water_2026"));
  assert.ok(findMarketPriceReferences("Remplacer un tableau électrique triphasé").some((item) => item.id === "electric_panel_2026"));
});

test("les références exposent fraîcheur, sources et justification de confiance", () => {
  const facade = findMarketPriceReferences("Ravalement avec peinture de façade").find((item) => item.id === "facade_painting_2026");
  assert.ok(facade);
  assert.ok(facade.sources.length >= 2);
  assert.match(facade.freshnessDate, /^2026-/);
  assert.match(facade.confidenceReason, /source|guide/i);
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

test("utilise uniquement une bande régionale explicitement sourcée pour l'électricien", () => {
  const result = findMarketPriceReferences("Électricien au tarif horaire pour chantier à Lyon");
  const hourly = result.find((item) => item.id === "electrician_hourly_2026");
  assert.ok(hourly);
  assert.equal(hourly.low, 70);
  assert.equal(hourly.market, 82.5);
  assert.equal(hourly.comfortable, 95);
  assert.match(hourly.regionalNote ?? "", /70.?95|grande agglomération/i);
});

test("signale le surcoût carrelage grande métropole sans l'appliquer aux valeurs", () => {
  const national = findMarketPriceReferences("Pose de carrelage dans une maison").find((item) => item.id === "tile_installation_2026");
  const lyon = findMarketPriceReferences("Pose de carrelage à Lyon").find((item) => item.id === "tile_installation_2026");
  assert.ok(national && lyon);
  assert.equal(lyon.low, national.low);
  assert.equal(lyon.market, national.market);
  assert.equal(lyon.comfortable, national.comfortable);
  assert.match(lyon.regionalNote ?? "", /20.?30|aucune majoration|non appliqu/i);
});

test("applique seulement le prix unitaire choisi sur une unique ligne compatible", () => {
  const original: QuoteLine[] = [{ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: null, tax_rate: 10 }];
  const result = applyMarketPriceToQuoteItems(original, { referenceId: "painting_wall_2026", level: "market" }, "Peindre les murs");
  assert.equal(result.applied, true);
  assert.equal(result.reason, "applied");
  assert.deepEqual(result.items[0], { label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: 28, tax_rate: 10 });
  assert.equal(original[0].unit_price, null);
});

test("n'écrase jamais un prix explicitement renseigné", () => {
  const result = applyMarketPriceToQuoteItems<QuoteLine>(
    [{ label: "Peinture des murs", quantity: 42, unit: "m²", unit_price: 32, tax_rate: 10 }],
    { referenceId: "painting_wall_2026", level: "market" },
    "Peindre les murs",
  );
  assert.equal(result.applied, false);
  assert.equal(result.reason, "explicit_price");
  assert.equal(result.items[0].unit_price, 32);
});

test("refuse une unité incompatible au lieu de deviner", () => {
  const result = applyMarketPriceToQuoteItems<QuoteLine>(
    [{ label: "Peinture des murs", quantity: 1, unit: "forfait", unit_price: null, tax_rate: 10 }],
    { referenceId: "painting_wall_2026", level: "market" },
  );
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no_matching_item");
});

test("refuse une application ambiguë quand deux lignes correspondent", () => {
  const result = applyMarketPriceToQuoteItems<QuoteLine>(
    [
      { label: "Peinture mur salon", quantity: 20, unit: "m²", unit_price: null, tax_rate: 10 },
      { label: "Peinture mur chambre", quantity: 15, unit: "m²", unit_price: null, tax_rate: 10 },
    ],
    { referenceId: "painting_wall_2026", level: "market" },
  );
  assert.equal(result.applied, false);
  assert.equal(result.reason, "ambiguous");
  assert.equal(result.matchedCount, 2);
});

test("refuse une référence inconnue et les unités composées informatives", () => {
  const unknown = applyMarketPriceToQuoteItems<QuoteLine>([], { referenceId: "missing", level: "market" });
  assert.equal(unknown.reason, "reference_not_found");
  const scaffold = applyMarketPriceToQuoteItems<QuoteLine>(
    [{ label: "Location échafaudage", quantity: 40, unit: "m²", unit_price: null, tax_rate: 20 }],
    { referenceId: "scaffold_rental_fixed_2026", level: "market" },
  );
  assert.equal(scaffold.applied, false);
  assert.equal(scaffold.reason, "not_applicable");
});

test("une prestation non couverte ne reçoit toujours aucun repère", () => {
  assert.deepEqual(findMarketPriceReferences("Installer une borne de recharge triphasée"), []);
});
