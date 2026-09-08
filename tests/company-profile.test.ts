import assert from "node:assert/strict";
import test from "node:test";
import { accountingExerciseLabel, buildDocumentEmailMessage, companyProfileDisplayName, defaultCompanyProfile, normalizeCompanyProfile, readCompanyProfile, writeCompanyProfile } from "../lib/company-profile";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("normalise le profil sans accepter un faux logo", () => {
  const profile = normalizeCompanyProfile({ legalName: "  Atelier Martin  ", displayName: " Atelier Martin ", siret: "123 456 789 00012", email: " CONTACT@EXAMPLE.FR ", logoDataUrl: "javascript:bad", accountingStart: "02-01", accountingEnd: "01-31" });
  assert.equal(profile.legalName, "Atelier Martin");
  assert.equal(profile.displayName, "Atelier Martin");
  assert.equal(profile.siret, "12345678900012");
  assert.equal(profile.email, "contact@example.fr");
  assert.equal(profile.logoDataUrl, "");
  assert.equal(profile.accountingStart, "02-01");
});

test("persiste puis relit les réglages entreprise", () => {
  const storage = new MemoryStorage();
  const initial = defaultCompanyProfile();
  writeCompanyProfile(storage as unknown as Storage, { ...initial, legalName: "SARL Martin", displayName: "Atelier Martin", email: "contact@martin.fr", accountingEmail: "compta@martin.fr", phone: "04 00 00 00 00", emailIntro: "Merci pour votre confiance." });
  const profile = readCompanyProfile(storage as unknown as Storage);
  assert.equal(profile.legalName, "SARL Martin");
  assert.equal(profile.displayName, "Atelier Martin");
  assert.equal(profile.email, "contact@martin.fr");
  assert.equal(profile.accountingEmail, "compta@martin.fr");
  assert.equal(profile.phone, "04 00 00 00 00");
  assert.equal(profile.emailIntro, "Merci pour votre confiance.");
});

test("libellé d'exercice standard et décalé", () => {
  assert.equal(accountingExerciseLabel(defaultCompanyProfile(), 2026), "Exercice 2026");
  assert.equal(accountingExerciseLabel({ ...defaultCompanyProfile(), accountingStart: "04-01", accountingEnd: "03-31" }, 2026), "Exercice 01/04 → 31/03");
});

test("nom commercial prioritaire avec repli sur la raison sociale", () => {
  assert.equal(companyProfileDisplayName({ ...defaultCompanyProfile(), legalName: "SARL Martin", displayName: "Atelier Martin" }), "Atelier Martin");
  assert.equal(companyProfileDisplayName({ ...defaultCompanyProfile(), legalName: "SARL Martin" }), "SARL Martin");
  assert.equal(companyProfileDisplayName(defaultCompanyProfile()), "Votre entreprise");
});

test("message e-mail utilise le texte personnalisé et l'identité", () => {
  const message = buildDocumentEmailMessage({ ...defaultCompanyProfile(), legalName: "SARL Martin", displayName: "Atelier Martin", emailIntro: "Veuillez trouver ci-joint. Merci." }, "Devis", "D-2026-001");
  assert.match(message, /Veuillez trouver ci-joint/);
  assert.match(message, /D-2026-001/);
  assert.match(message, /Atelier Martin/);
  assert.doesNotMatch(message, /SARL Martin$/);
});
