import { expect, test } from "@playwright/test";

const AVAILABLE_TRADES = [
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
];

test("le copilote conserve la peinture par défaut et détecte le tapissier en compatibilité", async ({ request }) => {
  const painting = await request.post("/api/copilot/proposal", {
    data: {
      description: "Peinture de 45 m² de murs et 20 m² de plafonds avec deux portes.",
    },
  });
  expect(painting.ok()).toBeTruthy();
  const paintingBody = await painting.json();
  expect(paintingBody.trade).toBe("interior_painting");
  expect(paintingBody.proposal.interpretation.trade).toBe("interior_painting");

  const upholstery = await request.post("/api/copilot/proposal", {
    data: {
      description: "Deux fauteuils Voltaire, dégarnissage complet, garniture traditionnelle, le client fournit le tissu, je change la passementerie et je les lui ramène.",
    },
  });
  expect(upholstery.ok()).toBeTruthy();
  const upholsteryBody = await upholstery.json();
  expect(upholsteryBody.trade).toBe("upholstery_decorator");
  expect(upholsteryBody.proposal.interpretation.facts.itemCount).toBe(2);
  expect(upholsteryBody.proposal.interpretation.facts.fabricProvidedBy).toBe("client");
  expect(upholsteryBody.proposal.status).toBe("needs_information");
  expect(upholsteryBody.proposal.lines.every((line: { unitPriceHt: number }) => line.unitPriceHt === 0)).toBeTruthy();
});

test("un métier encore planifié est refusé au lieu d’utiliser silencieusement un autre pack", async ({ request }) => {
  const response = await request.post("/api/copilot/proposal", {
    data: {
      trade: "facadier",
      description: "Ravalement complet de 85 m² de façade avec reprise des fissures.",
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toContain("pas encore pris en charge");
});

test("le catalogue de métiers distingue les dix packs exécutables des métiers planifiés", async ({ request }) => {
  const response = await request.get("/api/copilot/trades");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  expect(body.trades.length).toBeGreaterThanOrEqual(50);
  expect(body.availablePacks.map((pack: { trade: string }) => pack.trade).sort()).toEqual(AVAILABLE_TRADES);
  expect(body.trades.some((trade: { id: string; availability: string; packTrade?: string }) =>
    trade.id === "electricien" && trade.availability !== "planned" && trade.packTrade === "electrician",
  )).toBeTruthy();
  expect(body.trades.some((trade: { id: string; availability: string; packTrade?: string }) =>
    trade.id === "facadier" && trade.availability === "planned" && !trade.packTrade,
  )).toBeTruthy();
});
