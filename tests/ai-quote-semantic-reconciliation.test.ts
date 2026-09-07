import assert from "node:assert/strict";
import test from "node:test";
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

type StrictService = {
  designation: string;
  quantite: number | null;
  unite: string | null;
  prix_unitaire_ht: number | null;
  taux_tva: number | null;
};

function knownSubtotal(services: StrictService[]) {
  return services.reduce((sum, service) => (
    service.quantite === null || service.prix_unitaire_ht === null
      ? sum
      : sum + service.quantite * service.prix_unitaire_ht
  ), 0);
}

function knownTax(services: StrictService[]) {
  const raw = services.reduce((sum, service) => (
    service.quantite === null || service.prix_unitaire_ht === null || service.taux_tva === null
      ? sum
      : sum + service.quantite * service.prix_unitaire_ht * service.taux_tva / 100
  ), 0);
  return Math.round(raw * 100) / 100;
}

test("le garde-fou déterministe empêche DeepSeek de supprimer ou modifier les données explicites", async () => {
  const previousApiKey = process.env.DEEPSEEK_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";

  const aiDrift = {
    client: { nom: "Quentin Dubois" },
    prestations: [
      { designation: "Protection du sol et des meubles", quantite: null, unite: null, prix_unitaire_ht: null, taux_tva: null },
      { designation: "Préparation des murs", quantite: null, unite: null, prix_unitaire_ht: null, taux_tva: null },
      { designation: "Peinture des murs (2 couches)", quantite: 42, unite: "m2", prix_unitaire_ht: 32, taux_tva: 10 },
      { designation: "Peinture du plafond", quantite: 18, unite: "m2", prix_unitaire_ht: 29, taux_tva: 10 },
      { designation: "Peinture des plinthes", quantite: 14, unite: "m", prix_unitaire_ht: 9, taux_tva: null },
      { designation: "Repeinture de porte", quantite: 1, unite: "unite", prix_unitaire_ht: 45, taux_tva: null },
      { designation: "Pose de papier peint", quantite: 24, unite: "m2", prix_unitaire_ht: 12, taux_tva: 10 },
      { designation: "Reprise d'enduit dans le couloir", quantite: null, unite: null, prix_unitaire_ht: null, taux_tva: null },
    ],
  };

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(aiDrift) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const response = await parseStrictPost(new Request("http://localhost/api/ai/parse-strict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: QUENTIN_DUBOIS_FIXTURE,
        target: "quote",
        context_clients: ["Quentin Dubois"],
      }),
    }));

    assert.equal(response.ok, true);
    const payload = await response.json() as { strict_data: { client: { nom: string }; prestations: StrictService[] } };
    const services = payload.strict_data.prestations;

    const combinedWalls = services.filter((service) => /préparation.*murs.*deux couches|preparation.*murs.*deux couches/i.test(service.designation));
    const standalonePreparation = services.filter((service) => /^préparation des murs$|^preparation des murs$/i.test(service.designation));
    const wallpaper = services.find((service) => /papier peint/i.test(service.designation));
    const bedroom = services.find((service) => /chambre/i.test(service.designation) && /peinture|repeinture/i.test(service.designation));
    const door = services.find((service) => /porte/i.test(service.designation));
    const plinths = services.find((service) => /plinthe/i.test(service.designation));
    const siteProtection = services.find((service) => /protection du chantier/i.test(service.designation));
    const corridorPlaster = services.find((service) => /enduit/i.test(service.designation) && /couloir/i.test(service.designation));
    const floorProtection = services.find((service) => /protection/i.test(service.designation) && /sol/i.test(service.designation));

    assert.equal(payload.strict_data.client.nom, "Quentin Dubois");
    assert.equal(combinedWalls.length, 1);
    assert.equal(combinedWalls[0]?.quantite, 42);
    assert.equal(combinedWalls[0]?.prix_unitaire_ht, 32);
    assert.equal(combinedWalls[0]?.taux_tva, 10);
    assert.equal(standalonePreparation.length, 0);

    assert.ok(wallpaper);
    assert.match(wallpaper?.designation ?? "", /dépose|depose|enlèvement|enlevement/i);
    assert.doesNotMatch(wallpaper?.designation ?? "", /^pose de papier peint$/i);
    assert.equal(wallpaper?.quantite, 24);
    assert.equal(wallpaper?.prix_unitaire_ht, 12);
    assert.equal(wallpaper?.taux_tva, 10);

    assert.ok(bedroom, "La prestation chambre ne doit jamais disparaître si elle est explicitement dictée.");
    assert.equal(bedroom?.quantite, 24);
    assert.equal(bedroom?.prix_unitaire_ht, 30);
    assert.equal(bedroom?.taux_tva, 10);

    assert.ok(door);
    assert.equal(door?.quantite, 1);
    assert.equal(door?.unite, "unite");
    assert.equal(door?.prix_unitaire_ht, 85, "Une correction de quantité ne doit jamais transformer 85 € en 45 €.");
    assert.equal(door?.taux_tva, 10);

    assert.ok(plinths);
    assert.equal(plinths?.quantite, 14);
    assert.equal(plinths?.prix_unitaire_ht, 9);
    assert.equal(plinths?.taux_tva, 10);

    for (const incomplete of [floorProtection, corridorPlaster, siteProtection]) {
      assert.ok(incomplete);
      assert.equal(incomplete?.quantite, null);
      assert.equal(incomplete?.unite, null);
      assert.equal(incomplete?.prix_unitaire_ht, null);
    }

    assert.equal(knownSubtotal(services), 3085);
    assert.equal(knownTax(services), 308.5);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousApiKey;
  }
});

test("tolère les variantes de transcription qui avaient laissé 2 portes et la TVA des plinthes vide", async () => {
  const previousApiKey = process.env.DEEPSEEK_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";

  const sttVariant = QUENTIN_DUBOIS_FIXTURE
    .replace("peinture des plinthes", "peinture des plaintes")
    .replace("n’en mets qu’une", "n’en met qu’une");

  const aiDrift = {
    client: { nom: "Quentin Dubois" },
    prestations: [
      { designation: "Peinture des plinthes dans le salon", quantite: 14, unite: "m", prix_unitaire_ht: 9, taux_tva: null },
      { designation: "Peinture de 2 portes", quantite: 2, unite: "unite", prix_unitaire_ht: 85, taux_tva: 10 },
    ],
  };

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(aiDrift) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const response = await parseStrictPost(new Request("http://localhost/api/ai/parse-strict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: sttVariant,
        target: "quote",
        context_clients: ["Quentin Dubois"],
      }),
    }));

    assert.equal(response.ok, true);
    const payload = await response.json() as { strict_data: { prestations: StrictService[] } };
    const services = payload.strict_data.prestations;
    const door = services.find((service) => /porte/i.test(service.designation));
    const plinths = services.find((service) => /plinthe/i.test(service.designation));

    assert.ok(door);
    assert.equal(door?.quantite, 1);
    assert.equal(door?.prix_unitaire_ht, 85);
    assert.equal(door?.taux_tva, 10);

    assert.ok(plinths);
    assert.equal(plinths?.quantite, 14);
    assert.equal(plinths?.prix_unitaire_ht, 9);
    assert.equal(plinths?.taux_tva, 10);

    assert.equal(knownSubtotal(services), 3085);
    assert.equal(knownTax(services), 308.5);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousApiKey;
  }
});