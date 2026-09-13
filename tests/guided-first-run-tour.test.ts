import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("guided tour is wired only when auth bypass is disabled", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/responsive-app.tsx"), "utf8");
  assert.match(source, /import GuidedFirstRunTour from "\.\/guided-first-run-tour"/);
  assert.equal(source.includes("!AUTH_BYPASS && <GuidedFirstRunTour />"), true);
});

test("guided tour keeps mandatory company onboarding and replaces only tutorial experience", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
  assert.equal(source.includes('resolveFirstRunStage(readCompanyProfile(window.localStorage))'), true);
  assert.equal(source.includes('next === "tutorial"'), true);
  assert.equal(source.includes("markTutorialComplete"), true);
  assert.equal(source.includes("Passer"), true);
  assert.equal(source.includes("Précédent"), true);
  assert.equal(source.includes("Suivant"), true);
});

test("guided tour contains distinct mobile and desktop operational destinations", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
  assert.equal(source.includes("DESKTOP_STEPS"), true);
  assert.equal(source.includes("MOBILE_STEPS"), true);
  for (const destination of ["Clients", "Devis", "Factures", "Chantiers", "Paramètres", "Copilote"]) {
    assert.equal(source.includes(destination), true, `missing ${destination}`);
  }
});

test("guided tour teaches the voice-first workflow on desktop and mobile", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
  assert.equal(source.includes("Parlez. MANUFEO prépare. Vous validez."), true);
  assert.equal(source.includes(".pc-ai-launcher"), true);
  assert.equal(source.includes(".pc-mobile-ai-fab"), true);
  assert.equal(source.includes("Dicter avec l’IA"), true);
  assert.equal(source.includes("transcription → lignes structurées → vérification → préremplissage"), true);
});

test("guided tour clearly distinguishes voice entry from the trade copilot", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/guided-first-run-tour.tsx"), "utf8");
  assert.equal(source.includes("Vocal IA ="), true);
  assert.equal(source.includes("Copilote ="), true);
  assert.equal(source.includes("coûts et marge"), true);
  assert.equal(source.includes("oublis possibles"), true);
});
