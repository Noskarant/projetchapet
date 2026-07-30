import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgendaVoiceData, parseAgendaVoiceRequest } from "../lib/mobile-agenda-voice";

const reference = new Date(2026, 6, 30, 12, 0, 0);

test("comprend mardi prochain, l’heure, le client et le lieu", () => {
  const result = parseAgendaVoiceRequest(
    "Mets-moi un rendez-vous mardi prochain à 14h30 avec SCI Bellevue à 4 place du Monteil pour faire le point avant démarrage.",
    reference,
  );

  assert.deepEqual(result, {
    customer_hint: "SCI Bellevue",
    title: "Rendez-vous",
    date: "2026-08-04",
    time: "14:30",
    location: "4 place du Monteil",
    type: "Chantier",
    warnings: [],
  });
});

test("comprend demain et classe une relance", () => {
  const result = parseAgendaVoiceRequest(
    "Rappelle le client Isabelle Dechaud demain à 9 heures pour relancer son devis.",
    reference,
  );

  assert.equal(result.date, "2026-07-31");
  assert.equal(result.time, "09:00");
  assert.equal(result.customer_hint, "Isabelle Dechaud");
  assert.equal(result.type, "Relance");
  assert.equal(result.title, "Relance client");
});

test("comprend une date française explicite", () => {
  const result = parseAgendaVoiceRequest(
    "Planifie une visite le 12 septembre 2026 à 8h05 avec Mme Soulier à Firminy.",
    reference,
  );

  assert.equal(result.date, "2026-09-12");
  assert.equal(result.time, "08:05");
  assert.equal(result.customer_hint, "Mme Soulier");
  assert.equal(result.location, "Firminy");
  assert.equal(result.title, "Visite chantier");
});

test("normalise une réponse IA et conserve le secours local", () => {
  const result = normalizeAgendaVoiceData(
    {
      customer_hint: "SCI BELLEVUE",
      title: "Point avant travaux",
      date: "2026-08-04",
      time: "14:30",
      location: "4 place du Monteil",
      type: "Chantier",
      warnings: [],
    },
    "Rendez-vous mardi prochain avec SCI Bellevue",
    reference,
  );

  assert.equal(result.date, "2026-08-04");
  assert.equal(result.time, "14:30");
  assert.equal(result.customer_hint, "SCI BELLEVUE");
  assert.equal(result.location, "4 place du Monteil");
  assert.deepEqual(result.warnings, []);
});
