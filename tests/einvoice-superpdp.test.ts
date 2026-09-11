import assert from "node:assert/strict";
import test from "node:test";
import {
  createEInvoiceOAuthState,
  openEInvoiceSecret,
  sealEInvoiceSecret,
  verifyEInvoiceOAuthState,
} from "../lib/einvoice/crypto";
import {
  buildSuperPdpAuthorizationUrl,
  extractFrenchSiren,
  superPdpConfiguration,
} from "../lib/einvoice/superpdp";

const SECRET = "manufeo-test-secret-long-enough-2026";

test("extrait le SIREN à partir d’un SIRET français", () => {
  assert.equal(extractFrenchSiren("123 456 789 00012"), "123456789");
  assert.equal(extractFrenchSiren("123"), "");
});

test("chiffre et déchiffre les jetons de plateforme agréée", () => {
  const encrypted = sealEInvoiceSecret("access-token-ultra-secret", SECRET);
  assert.notEqual(encrypted, "access-token-ultra-secret");
  assert.match(encrypted, /^v1\./);
  assert.equal(openEInvoiceSecret(encrypted, SECRET), "access-token-ultra-secret");
  assert.throws(() => openEInvoiceSecret(encrypted, `${SECRET}-wrong`));
});

test("signe, vérifie et expire l’état OAuth multi-entreprise", () => {
  const now = Date.parse("2026-09-11T19:00:00.000Z");
  const state = createEInvoiceOAuthState({
    organizationId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    expiresAt: now + 600_000,
    redirectUri: "https://manufeo.fr/api/einvoice/superpdp/callback",
  }, SECRET);
  const verified = verifyEInvoiceOAuthState(state, SECRET, now);
  assert.equal(verified.organizationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(verified.userId, "22222222-2222-4222-8222-222222222222");
  assert.throws(() => verifyEInvoiceOAuthState(`${state}x`, SECRET, now));
  assert.throws(() => verifyEInvoiceOAuthState(state, SECRET, now + 700_000));
});

test("construit le flow authorization code SUPER PDP avec préremplissage SIREN", () => {
  const config = {
    baseUrl: "https://api.superpdp.tech",
    clientId: "client-manufeo",
    clientSecret: "secret-not-in-url",
  };
  const url = new URL(buildSuperPdpAuthorizationUrl({
    config,
    redirectUri: "https://manufeo.fr/api/einvoice/superpdp/callback",
    state: "signed-state",
    loginHint: "artisan@example.com",
    siren: "123456789",
  }));
  assert.equal(url.origin, "https://api.superpdp.tech");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-manufeo");
  assert.equal(url.searchParams.get("superpdp_company_number"), "123456789");
  assert.equal(url.searchParams.get("superpdp_company_number_scheme"), "fr_siren");
  assert.equal(url.searchParams.get("login_hint"), "artisan@example.com");
  assert.equal(url.toString().includes("secret-not-in-url"), false);
});

test("considère SUPER PDP configuré seulement avec client id et secret", () => {
  assert.equal(superPdpConfiguration({}).configured, false);
  const result = superPdpConfiguration({
    SUPERPDP_CLIENT_ID: "id",
    SUPERPDP_CLIENT_SECRET: "secret",
  });
  assert.equal(result.configured, true);
  assert.equal(result.config.baseUrl, "https://api.superpdp.tech");
});
