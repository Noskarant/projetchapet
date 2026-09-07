import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackStrictVoiceDocument,
  filterSpeechNoise,
  normalizeStrictVoiceDocument,
  resolveContextClient,
  strictDocumentToLegacy,
} from "../lib/strict-voice-document";
import { robustArtisanDictation } from "../lib/robust-artisan-dictation";
import { calculateTotals, type LineItem } from "../lib/mobile-prototype";
import { POST as parseStrictPost } from "../app/api/ai/parse-strict/route";

const QUENTIN_DUBOIS_FIXTURE = `Fais-moi un devis pour Quentin Dubois.
Dans le salon, il faut protéger le sol et les meubles, préparer les murs puis faire deux couches de peinture.
Il y a 46 mètres carrés de murs… non attends, 42 mètres carrés, à 32 euros le mètre carré avec TVA à 10 %.
Pour le plafond, compte 18 mètres carrés à 29 euros le mètre carré, TVA 10 %.
Ajoute aussi la peinture des plinthes, 14 mètres linéaires à 9 euros le mètre.
Il y a deux portes à repeindre à 85 euros l’unité.
Dans la chambre, il faut enlever l’ancien papier peint sur 24 mètres carrés à 12 euros le mètre carré, puis préparer et repeindre ces 24 mètres carrés à 30 euros le mètre carré.
Ah et pour les portes, finalement n’en mets qu’une, pas deux.
Ajoute aussi une reprise d’enduit dans le couloir mais je n’ai pas encore la surface exacte.
Et prévois la protection du chantier, mais je ne t’ai pas donné de tarif pour ça.`;

function legacyFromRobust(text: string) {
  return strictDocumentToLegacy(robustArtisanDictation(text));
}

function findItem(items: ReturnType<typeof legacyFromRobust>["items"], pattern: RegExp) {
  const item = items.find((entry) => pattern.test(entry.label));
  assert.ok(item, `Ligne introuvable: ${pattern}`);
  return item;
}

function knownTotals(items: ReturnType<typeof legacyFromRobust>["items"]) {
  const subtotal = items.reduce((sum, item) => (
    item.quantity === null || item.unit_price === null ? sum : sum + item.quantity * item.unit_price
  ), 0);
  const tax = items.reduce((sum, item) => (
    item.quantity === null || item.unit_price === null ? sum : sum + item.quantity * item.unit_price * ((item.tax_rate ?? 0) / 100)
  ), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((subtotal + tax) * 100) / 100,
  };
}

test("preserves unknown quantity and price instead of inventing forfait zero", () => {
  const result = fallbackStrictVoiceDocument("Pour Quentin Dubois, ajoute une reprise d'enduit dans le couloir mais je n'ai pas encore la surface exacte. Prévois aussi la protection du chantier, mais je ne t'ai pas donné de tarif.");
  const enduit = result.prestations.find((line) => /enduit/i.test(line.designation));
  const protection = result.prestations.find((line) => /protection/i.test(line.designation));
  assert.ok(enduit);
  assert.equal(enduit?.quantite, null);
  assert.equal(enduit?.unite, null);
  assert.equal(enduit?.prix_unitaire_ht, null);
  assert.ok(protection);
  assert.equal(protection?.prix_unitaire_ht, null);
});

test("Quentin Dubois conserve les valeurs explicites et laisse les inconnues à compléter", () => {
  const result = fallbackStrictVoiceDocument(
    "Fais-moi un devis pour Quentin Dubois. " +
    "Dans le salon, il faut protéger le sol et les meubles, préparer les murs puis faire deux couches de peinture. " +
    "Il y a 46 mètres carrés de murs, non attends, 42 mètres carrés, à 32 euros le mètre carré avec TVA à 10 %. " +
    "Pour le plafond, compte 18 mètres carrés à 29 euros le mètre carré, TVA 10 %. " +
    "Ajoute aussi la peinture des plinthes, 14 mètres linéaires à 9 euros le mètre. " +
    "Il y a deux portes à repeindre à 85 euros l'unité. " +
    "Dans la chambre, il faut enlever l'ancien papier peint sur 24 mètres carrés à 12 euros le mètre carré, " +
    "puis préparer et repeindre ces 24 mètres carrés à 30 euros le mètre carré. " +
    "Ah et pour les portes, finalement n'en mets qu'une, pas deux. " +
    "Ajoute aussi une reprise d'enduit dans le couloir mais je n'ai pas encore la surface exacte. " +
    "Et prévois la protection du chantier, mais je ne t'ai pas donné de tarif pour ça.",
  );
  const legacy = strictDocumentToLegacy(result);
  const knownSubtotal = legacy.items.reduce((sum, item) => (
    item.quantity === null || item.unit_price === null ? sum : sum + item.quantity * item.unit_price
  ), 0);
  const knownTax = legacy.items.reduce((sum, item) => (
    item.quantity === null || item.unit_price === null ? sum : sum + item.quantity * item.unit_price * ((item.tax_rate ?? 0) / 100)
  ), 0);
  const door = legacy.items.find((item) => /porte/i.test(item.label));
  const enduit = legacy.items.find((item) => /enduit/i.test(item.label));
  const chantierProtection = legacy.items.find((item) => /protection du chantier/i.test(item.label));
  const floorProtection = legacy.items.find((item) => /protéger le sol|proteger le sol|protection.*sol/i.test(item.label));

  assert.equal(legacy.customer_hint, "Quentin Dubois");
  assert.equal(door?.quantity, 1);
  assert.equal(door?.unit_price, 85);
  assert.equal(knownSubtotal, 3085);
  assert.equal(Math.round((knownSubtotal + knownTax) * 100) / 100, 3393.5);
  for (const item of [floorProtection, enduit, chantierProtection]) {
    assert.ok(item);
    assert.equal(item.quantity, null);
    assert.equal(item.unit_price, null);
  }
});

const contextClients = [
  "M. Dupont-Jacques",
  "Mme SOULIER Françoise",
  "SCI BELLEVUE",
];

test("rattache Monsieur au client M. avec un nom composé", () => {
  const result = resolveContextClient(contextClients, "Monsieur dupont jacques");
  assert.deepEqual(result, { status: "matched", name: "M. Dupont-Jacques" });
});

test("tolère une transcription phonétique légère mais refuse de deviner entre homonymes", () => {
  const matched = resolveContextClient(contextClients, "Monsieur Dupont Jacque");
  assert.equal(matched.status, "matched");
  assert.equal(matched.name, "M. Dupont-Jacques");

  const ambiguous = resolveContextClient(["M. Dupont-Jacques", "M. Dupont-Martin"], "Monsieur Dupont");
  assert.equal(ambiguous.status, "ambiguous");
});

test("la dernière version d’une prestation remplace les doublons du JSON IA", () => {
  const result = normalizeStrictVoiceDocument({
    client: { nom: "Monsieur Dupont-Jacques" },
    prestations: [
      { designation: "Peinture murs", quantite: 20, unite: "m2", prix_unitaire_ht: 30, taux_tva: 10 },
      { designation: "Peinture murs", quantite: 25, unite: "m2", prix_unitaire_ht: 32, taux_tva: 10 },
    ],
  }, contextClients);

  assert.equal(result.client.nom, "M. Dupont-Jacques");
  assert.equal(result.prestations.length, 1);
  assert.deepEqual(result.prestations[0], {
    designation: "Peinture murs",
    quantite: 25,
    unite: "m2",
    prix_unitaire_ht: 32,
    taux_tva: 10,
  });
});

test("le secours local applique la dernière quantité et le dernier prix", () => {
  const result = fallbackStrictVoiceDocument(
    "Client Monsieur Dupont-Jacques, euh peinture des murs 20 m2 à 30 euros. Non attends plutôt 25 m2 à 32 euros. Bref TVA 10 %.",
    contextClients,
  );

  assert.equal(result.client.nom, "M. Dupont-Jacques");
  assert.equal(result.prestations.length, 1);
  assert.equal(result.prestations[0]?.quantite, 25);
  assert.equal(result.prestations[0]?.prix_unitaire_ht, 32);
  assert.equal(result.prestations[0]?.taux_tva, 10);
  assert.match(result.prestations[0]?.designation ?? "", /peinture des murs/i);
  assert.doesNotMatch(result.prestations[0]?.designation ?? "", /dupont/i);
});

test("une ligne annulée disparaît totalement et la nouvelle ligne reste seule", () => {
  const result = fallbackStrictVoiceDocument(
    "Pour Madame Soulier, ajoute dépose ancien papier 1 forfait à 450 euros. Non oublie la dépose. Plutôt préparation du support 2 h à 40 euros, TVA 10 %.",
    contextClients,
  );

  assert.equal(result.client.nom, "Mme SOULIER Françoise");
  assert.equal(result.prestations.length, 1);
  assert.match(result.prestations[0]?.designation ?? "", /préparation du support|preparation du support/i);
  assert.equal(result.prestations[0]?.quantite, 2);
  assert.equal(result.prestations[0]?.unite, "h");
  assert.equal(result.prestations[0]?.prix_unitaire_ht, 40);
  assert.doesNotMatch(JSON.stringify(result), /ancien papier|450/);
});

test("le dernier client énoncé remplace le précédent", () => {
  const result = fallbackStrictVoiceDocument(
    "Client Monsieur Dupont-Jacques. Non finalement client Madame Soulier. Peinture plafond 12 m2 à 35 euros TVA 10 %.",
    contextClients,
  );
  assert.equal(result.client.nom, "Mme SOULIER Françoise");
});

test("filtre le bruit et le parlé parasite", () => {
  const cleaned = filterSpeechNoise("Euh bref du coup peinture 10 m2, tu vois, à 20 euros quoi.");
  assert.doesNotMatch(cleaned, /euh|bref|du coup|tu vois|quoi/i);
  assert.match(cleaned, /peinture 10 m2/i);
});

test("convertit le JSON strict vers le format interne sans notes parasites", () => {
  const legacy = strictDocumentToLegacy({
    client: { nom: "SCI BELLEVUE" },
    prestations: [{
      designation: "Ratissage complet",
      quantite: 18,
      unite: "m2",
      prix_unitaire_ht: 28,
      taux_tva: 10,
    }],
  });

  assert.equal(legacy.customer_hint, "SCI BELLEVUE");
  assert.equal(legacy.notes, "");
  assert.equal(legacy.items[0]?.unit, "m²");
  assert.equal(legacy.items[0]?.unit_price, 28);
});

test("pipeline robuste Quentin Dubois: corrections, inconnues et totaux exacts", () => {
  const legacy = legacyFromRobust(QUENTIN_DUBOIS_FIXTURE);
  const walls = findItem(legacy.items, /préparation.*murs.*deux couches|preparation.*murs.*deux couches/i);
  const ceiling = findItem(legacy.items, /plafond/i);
  const plinths = findItem(legacy.items, /plinthes/i);
  const door = findItem(legacy.items, /porte/i);
  const wallpaper = findItem(legacy.items, /papier peint/i);
  const bedroom = findItem(legacy.items, /chambre/i);
  const floorProtection = findItem(legacy.items, /protection.*sol|sol.*meubles/i);
  const enduit = findItem(legacy.items, /enduit.*couloir/i);
  const chantierProtection = findItem(legacy.items, /protection du chantier/i);
  const totals = knownTotals(legacy.items);

  assert.equal(legacy.customer_hint, "Quentin Dubois");
  assert.equal(walls.quantity, 42);
  assert.equal(walls.unit_price, 32);
  assert.equal(ceiling.quantity, 18);
  assert.equal(ceiling.unit_price, 29);
  assert.equal(plinths.quantity, 14);
  assert.equal(plinths.unit_price, 9);
  assert.equal(door.quantity, 1);
  assert.equal(door.unit_price, 85);
  assert.equal(wallpaper.quantity, 24);
  assert.equal(wallpaper.unit_price, 12);
  assert.equal(bedroom.quantity, 24);
  assert.equal(bedroom.unit_price, 30);
  assert.equal(totals.subtotal, 3085);
  assert.equal(totals.tax, 308.5);
  assert.equal(totals.total, 3393.5);

  for (const item of [floorProtection, enduit, chantierProtection]) {
    assert.equal(item.quantity, null);
    assert.equal(item.unit, null);
    assert.equal(item.unit_price, null);
    assert.notEqual(item.quantity, 1);
    assert.notEqual(item.unit, "forfait");
    assert.notEqual(item.unit_price, 0);
  }
});

test("route parse-strict couvre Quentin Dubois sans inventer de valeur en fallback local", async () => {
  const previousApiKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const response = await parseStrictPost(new Request("http://localhost/api/ai/parse-strict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: QUENTIN_DUBOIS_FIXTURE, target: "quote" }),
    }));
    assert.equal(response.ok, true);
    const payload = await response.json() as { data: ReturnType<typeof legacyFromRobust> };
    const door = findItem(payload.data.items, /porte/i);
    const totals = knownTotals(payload.data.items);
    const incomplete = payload.data.items.filter((item) => item.quantity === null || item.unit_price === null);

    assert.equal(payload.data.customer_hint, "Quentin Dubois");
    assert.equal(door.quantity, 1);
    assert.equal(door.unit_price, 85);
    assert.equal(totals.subtotal, 3085);
    assert.equal(totals.total, 3393.5);
    assert.ok(incomplete.length >= 3);
    assert.ok(incomplete.every((item) => item.quantity !== 1 && item.unit !== "forfait" && item.unit_price !== 0));
  } finally {
    if (previousApiKey) process.env.DEEPSEEK_API_KEY = previousApiKey;
  }
});

test("corrections orales tardives changent la quantité sans toucher le prix unitaire", () => {
  const oneDoor = legacyFromRobust("Pour Quentin Dubois, il y a deux portes à repeindre à 85 euros l'unité. Ah et pour les portes, finalement n'en mets qu'une, pas deux.");
  const twoDoors = legacyFromRobust("Pour Quentin Dubois, une porte à repeindre à 85 euros l'unité. Finalement deux portes.");
  const firstDoor = findItem(oneDoor.items, /porte/i);
  const secondDoor = findItem(twoDoors.items, /porte/i);

  assert.equal(firstDoor.quantity, 1);
  assert.equal(firstDoor.unit_price, 85);
  assert.equal(secondDoor.quantity, 2);
  assert.equal(secondDoor.unit_price, 85);
});

test("correction de surface conserve le prix unitaire prononcé", () => {
  const legacy = legacyFromRobust("Pour Quentin Dubois, préparer les murs puis faire deux couches de peinture. 42 mètres carrés à 32 euros, non 45 mètres carrés.");
  const walls = findItem(legacy.items, /peinture|murs/i);
  assert.equal(walls.quantity, 45);
  assert.equal(walls.unit_price, 32);
});

test("les valeurs inconnues restent null et ne deviennent ni forfait ni zéro", () => {
  const legacy = legacyFromRobust("Pour Quentin Dubois, pose de parquet mais je ne connais pas encore la surface. Protection chantier sans tarif.");
  assert.ok(legacy.items.length >= 1);
  assert.ok(legacy.items.every((item) => item.quantity === null || item.quantity > 0));
  assert.ok(legacy.items.every((item) => item.unit_price === null || item.unit_price >= 0));
  assert.ok(legacy.items.some((item) => item.quantity === null));
  assert.ok(legacy.items.some((item) => item.unit_price === null));
  assert.ok(legacy.items.every((item) => !(item.quantity === 1 && item.unit === "forfait" && item.unit_price === 0)));
});

test("prix explicitement offert à 0 euro reste une valeur métier valide", () => {
  const legacy = legacyFromRobust("Pour Quentin Dubois, prestation offerte nettoyage de fin de chantier 1 forfait à 0 euro TVA 10 %.");
  const offered = findItem(legacy.items, /nettoyage|chantier/i);
  assert.equal(offered.quantity, 1);
  assert.equal(offered.unit, "forfait");
  assert.equal(offered.unit_price, 0);
});

test("les lignes incomplètes sont exclues du calcul mobile sans être gratuites", () => {
  const items: LineItem[] = [
    { id: "known", label: "Peinture", description: "", quantity: 42, unit: "m²", unitPrice: 32, taxRate: 10, provenance: "user_explicit" },
    { id: "unknown", label: "Protection chantier", description: "", quantity: null, unit: null, unitPrice: null, taxRate: null, incomplete: true, provenance: "unknown" },
    { id: "free", label: "Geste commercial", description: "", quantity: 1, unit: "forfait", unitPrice: 0, taxRate: 10, provenance: "user_explicit" },
  ];
  const totals = calculateTotals(items);
  assert.equal(totals.subtotal, 1344);
  assert.equal(totals.taxTotal, 134.4);
  assert.equal(totals.total, 1478.4);
});
