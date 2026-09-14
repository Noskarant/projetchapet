import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUFEO_DEFAULT_SENDER,
  resendProviderErrorMessage,
  resolveManufeoSender,
} from "../lib/resend-email";

test("MANUFEO n'utilise jamais l'expéditeur sandbox resend.dev pour les clients", () => {
  assert.equal(resolveManufeoSender(""), MANUFEO_DEFAULT_SENDER);
  assert.equal(resolveManufeoSender(undefined), MANUFEO_DEFAULT_SENDER);
  assert.equal(resolveManufeoSender("onboarding@resend.dev"), MANUFEO_DEFAULT_SENDER);
  assert.equal(
    resolveManufeoSender("MANUFEO <onboarding@resend.dev>"),
    MANUFEO_DEFAULT_SENDER,
  );
});

test("un expéditeur réel configuré reste prioritaire", () => {
  assert.equal(
    resolveManufeoSender("MANUFEO <documents@manufeo.fr>"),
    "MANUFEO <documents@manufeo.fr>",
  );
});

test("les anciens noms de produit sont renommés MANUFEO", () => {
  assert.equal(
    resolveManufeoSender("FORGEO <documents@manufeo.fr>"),
    "MANUFEO <documents@manufeo.fr>",
  );
  assert.equal(
    resolveManufeoSender("Projet Chapet <documents@manufeo.fr>"),
    "MANUFEO <documents@manufeo.fr>",
  );
});

test("le 403 sandbox Resend remonte une erreur utile sans exposer le fournisseur", () => {
  const message = resendProviderErrorMessage(403, {
    message:
      "You can only send testing emails to your own email address. Please verify a domain.",
  });
  assert.match(message ?? "", /expéditeur de test/i);
  assert.doesNotMatch(message ?? "", /resend\.com|api key/i);
});

test("les autres erreurs fournisseur ne divulguent pas de détail", () => {
  assert.equal(resendProviderErrorMessage(500, { message: "internal secret detail" }), null);
});
