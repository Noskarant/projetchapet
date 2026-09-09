import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizePilotVisibleText } from "../app/pilot-readiness-ui-bridge";

const branchRuntimeSanitizedLegacyFile = "app/rappidos-mobile-shell-v2.tsx";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("le bridge de préparation pilote est monté dans l’application", () => {
  const responsiveApp = source("app/responsive-app.tsx");
  assert.match(responsiveApp, /import PilotReadinessUiBridge/);
  assert.match(responsiveApp, /<PilotReadinessUiBridge\s*\/>/);
});

test("les anciens libellés visibles sont transformés avant affichage", () => {
  const legacy = [
    "Confirme d’abord ton adresse e-mail.",
    "Utilise un mot de passe d’au moins 8 caractères.",
    "Connexion impossible pour le moment. Réessaie.",
    "Renseigne ton e-mail et ton mot de passe.",
    "Démo locale",
    "Réinitialiser les compléments de démo",
    "Réinitialiser uniquement les compléments de démonstration ?",
    "Compléments de démonstration réinitialisés.",
    "les écrans de démonstration",
    "avant le test de Philippe.",
    "PROJET CHAPET",
    "CHAPET Père & Fils",
    "CHAPET SAS",
    "compta@saschapet.com",
    "contact@saschapet.com",
  ].join(" | ");

  const cleaned = normalizePilotVisibleText(legacy, "Atelier Martin", "cabinet@compta.fr");

  assert.doesNotMatch(cleaned, /\b(?:ton|ta|tes|toi|tu)\b|\b(?:Renseigne|Utilise|Réessaie)\b/i);
  assert.doesNotMatch(cleaned, /démo|démonstration|test de Philippe|@saschapet\.com|PROJET CHAPET|CHAPET SAS|CHAPET Père & Fils/i);
  assert.match(cleaned, /Confirmez d’abord votre adresse e-mail/);
  assert.match(cleaned, /Renseignez votre e-mail et votre mot de passe/);
  assert.match(cleaned, /Atelier Martin/);
  assert.match(cleaned, /cabinet@compta\.fr/);
});

test("aucune ancienne adresse n’est utilisée par les flux d’envoi actifs", () => {
  const activeEmailFiles = [
    "app/api/email/route.ts",
    "app/authenticated-email-fetch-bridge.tsx",
    "app/document-workflow.tsx",
    "app/mobile-accounting-action.tsx",
    "lib/authenticated-email.ts",
    "lib/email-authorization.ts",
    "lib/mobile-commercial-demo.ts",
    "lib/mobile-prototype.ts",
    "lib/project-chapet.ts",
  ];

  for (const path of activeEmailFiles) {
    assert.doesNotMatch(source(path), /@saschapet\.com/i, path);
  }
});

test("l’unique ancienne valeur de présentation restante est neutralisée avant rendu", () => {
  const legacyShell = source(branchRuntimeSanitizedLegacyFile);
  assert.match(legacyShell, /@saschapet\.com/i);

  const cleaned = normalizePilotVisibleText(
    "Copie comptable : compta@saschapet.com",
    "Votre entreprise",
    "comptable@cabinet.fr",
  );
  assert.equal(cleaned, "Copie comptable : comptable@cabinet.fr");
});
