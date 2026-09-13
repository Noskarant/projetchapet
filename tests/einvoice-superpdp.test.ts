import assert from "node:assert/strict";
import test from "node:test";
import {
  createEInvoiceOAuthState,
  openEInvoiceSecret,
  sealEInvoiceSecret,
  verifyEInvoiceOAuthState,
} from "../lib/einvoice/crypto";
import { generateManufeoCii } from "../lib/einvoice/manufeo-en16931";
import {
  buildSuperPdpAuthorizationUrl,
  extractFrenchSiren,
  superPdpConfiguration,
} from "../lib/einvoice/superpdp";

const SECRET = "manufeo-test-secret-long-enough-2026";

function sampleElectronicInvoice() {
  return {
    company: {
      version: 1 as const,
      legalName: "MANUFEO TEST SAS",
      displayName: "MANUFEO TEST",
      siret: "12345678900012",
      vatNumber: "FR40123456789",
      email: "facturation@manufeo.test",
      accountingEmail: "",
      phone: "+33400000000",
      address: "10 rue de la République",
      postalCode: "69002",
      city: "Lyon",
      primaryTradeId: "painting",
      accountingStart: "01-01",
      accountingEnd: "12-31",
      logoDataUrl: "",
      emailIntro: "Veuillez trouver ci-joint votre document.",
      emailSignature: "Cordialement,",
      onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
      tutorialCompletedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
    customer: {
      id: "C-001",
      kind: "Professionnel" as const,
      companyName: "CLIENT TEST SARL",
      civility: "",
      lastName: "",
      firstName: "",
      emails: ["compta@client.test"],
      phones: ["+33411111111"],
      address: "20 avenue des Tests",
      postalCode: "69003",
      city: "Lyon",
      siret: "98765432100019",
      vat: "FR40987654321",
      notes: "",
    },
    invoice: {
      id: "I-001",
      number: "F-2026-001",
      customerId: "C-001",
      customerName: "CLIENT TEST SARL",
      title: "Travaux de peinture",
      issueDate: "2026-09-11",
      dueDate: "2026-10-11",
      status: "En cours" as const,
      items: [{
        id: "L-1",
        label: "Peinture murs",
        description: "Préparation et deux couches",
        quantity: 10,
        unit: "m²",
        unitPrice: 50,
        taxRate: 20,
      }],
      notes: "",
      subtotal: 500,
      taxTotal: 100,
      total: 600,
      paidTotal: 0,
      accountantSent: false,
    },
  };
}

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

test("normalise l’URL du portail SUPER PDP vers l’hôte API", () => {
  const result = superPdpConfiguration({
    SUPERPDP_CLIENT_ID: "id",
    SUPERPDP_CLIENT_SECRET: "secret",
    SUPERPDP_API_BASE_URL: "https://www.superpdp.tech/",
  });
  assert.equal(result.config.baseUrl, "https://api.superpdp.tech");
});

test("génère une facture CII EN16931 structurée avant envoi à la PA", () => {
  const generated = generateManufeoCii(sampleElectronicInvoice());
  assert.equal(generated.validation.valid, true);
  assert.match(generated.xml, /CrossIndustryInvoice/);
  assert.match(generated.xml, /F-2026-001/);
  assert.match(generated.xml, /0225/);
  assert.match(generated.xml, /987654321/);
});

test("refuse de deviner le motif fiscal d’une TVA à zéro", () => {
  const sample = sampleElectronicInvoice();
  sample.invoice.items[0]!.taxRate = 0;
  sample.invoice.taxTotal = 0;
  sample.invoice.total = 500;
  assert.throws(() => generateManufeoCii(sample), /TVA 0 %/);
});
