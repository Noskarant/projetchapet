import assert from "node:assert/strict";
import test from "node:test";
import { accountingExerciseLabel, buildDocumentEmailMessage, defaultCompanyProfile, normalizeCompanyProfile, readCompanyProfile, writeCompanyProfile } from "../lib/company-profile";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("normalise le profil sans accepter un faux logo", () => {
  const profile = normalizeCompanyProfile({ legalName: "  Atelier Martin  ", siret: "123 456 789 00012", logoDataUrl: "javascript:bad", accountingStart: "02-01", accountingEnd: "01-31" });
  assert.equal(profile.legalName, "Atelier Martin");
  assert.equal(profile.siret, "12345678900012");
  assert.equal(profile.logoDataUrl, "");
  assert.equal(profile.accountingStart, "02-01");
});

test("persiste puis relit les réglages entreprise", () => {
  const storage = new MemoryStorage();
  const initial = defaultCompanyProfile();
  writeCompanyProfile(storage as unknown as Storage, { ...initial, legalName: "SARL Martin", emailIntro: "Merci pour votre confiance." });
  const profile = readCompanyProfile(storage as unknown as Storage);
  assert.equal(profile.legalName, "SARL Martin");
  assert.equal(profile.emailIntro, "Merci pour votre confiance.");
});

test("libellé d'exercice standard et décalé", () => {
  assert.equal(accountingExerciseLabel(defaultCompanyProfile(), 2026), "Exercice 2026");
  assert.equal(accountingExerciseLabel({ ...defaultCompanyProfile(), accountingStart: "04-01", accountingEnd: "03-31" }, 2026), "Exercice 01/04 → 31/03");
});

test("message e-mail utilise le texte personnalisé et l'identité", () => {
  const message = buildDocumentEmailMessage({ ...defaultCompanyProfile(), legalName: "Atelier Martin", emailIntro: "Veuillez trouver ci-joint. Merci." }, "Devis", "D-2026-001");
  assert.match(message, /Veuillez trouver ci-joint/);
  assert.match(message, /D-2026-001/);
  assert.match(message, /Atelier Martin/);
});
