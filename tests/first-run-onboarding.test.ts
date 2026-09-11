import assert from "node:assert/strict";
import test from "node:test";
import { defaultCompanyProfile, normalizeCompanyProfile } from "../lib/company-profile";
import {
  companyOnboardingMissingFields,
  isCompanyOnboardingComplete,
  markCompanyOnboardingComplete,
  markTutorialComplete,
  resolveFirstRunStage,
} from "../lib/first-run-onboarding";

function completeProfile() {
  return {
    ...defaultCompanyProfile(),
    legalName: "Atelier Martin SARL",
    displayName: "Atelier Martin",
    siret: "12345678900012",
    email: "contact@atelier-martin.fr",
    phone: "04 72 00 00 00",
    address: "12 rue des Artisans",
    postalCode: "69000",
    city: "Lyon",
  };
}

test("un nouveau profil incomplet commence par les informations entreprise", () => {
  const profile = defaultCompanyProfile();
  assert.equal(resolveFirstRunStage(profile), "company");
  assert.ok(companyOnboardingMissingFields(profile).includes("siret"));
});

test("les informations essentielles rendent le profil prêt", () => {
  const profile = completeProfile();
  assert.equal(isCompanyOnboardingComplete(profile), true);
  assert.equal(resolveFirstRunStage(profile), null, "un ancien profil déjà complet ne doit pas être forcé dans le tutoriel");
});

test("après l’enregistrement entreprise le tutoriel reprend tant qu’il n’est pas terminé", () => {
  const started = markCompanyOnboardingComplete(completeProfile(), "2026-09-11T07:00:00.000Z");
  assert.equal(resolveFirstRunStage(started), "tutorial");
  const finished = markTutorialComplete(started, "2026-09-11T07:05:00.000Z");
  assert.equal(resolveFirstRunStage(finished), null);
  assert.equal(finished.tutorialCompletedAt, "2026-09-11T07:05:00.000Z");
});

test("les marqueurs d’onboarding survivent à la normalisation cloud", () => {
  const normalized = normalizeCompanyProfile({
    ...completeProfile(),
    onboardingCompletedAt: "2026-09-11T07:00:00.000Z",
    tutorialCompletedAt: "2026-09-11T07:05:00.000Z",
  });
  assert.equal(normalized.onboardingCompletedAt, "2026-09-11T07:00:00.000Z");
  assert.equal(normalized.tutorialCompletedAt, "2026-09-11T07:05:00.000Z");
});
