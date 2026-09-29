import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import {
  assertQuoteBelongsToRecipient,
  buildVoiceEmailQuoteAttachment,
  suggestedVoiceQuoteId,
  type VoiceEmailQuoteChoice,
} from "../lib/voice-email-quote-pdf";

const quote = {
  id: "11111111-1111-1111-1111-111111111111",
  number: "DEV-2026-001",
  title: "Peinture du séjour",
  status: "draft",
  issue_date: "2026-09-29",
  expiry_date: "2026-10-29",
  subtotal: 592,
  tax_total: 59.2,
  total: 651.2,
  notes: null,
  customer_id: "22222222-2222-2222-2222-222222222222",
  items: [{
    id: "line-1",
    position: 0,
    label: "Préparation et peinture des murs",
    description: "",
    quantity: 18.5,
    unit: "m²",
    unit_price: 32,
    tax_rate: 10,
  }],
};

const customer = {
  id: quote.customer_id,
  kind: "individual",
  company_name: null,
  civility: "M.",
  last_name: "Morel",
  first_name: "Julien",
  emails: ["julien.morel@exemple.com"],
  phones: ["06 12 34 56 78"],
  addresses: [{ line1: "24 rue des Acacias", postal_code: "69003", city: "Lyon", country: "France" }],
  siret: null,
  vat_number: null,
  notes: null,
};

const organization = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Martin peinture",
  siret: "12345678901234",
  vat_number: "FR00123456789",
  phone: "04 00 00 00 00",
  email: "contact@martin.test",
  address: { line1: "1 rue des Artisans", postal_code: "69000", city: "Lyon" },
};

test("un devis n’est présélectionné que s’il est clairement désigné et unique", () => {
  const first: VoiceEmailQuoteChoice = {
    id: quote.id,
    number: quote.number,
    title: quote.title,
    issueDate: quote.issue_date,
    total: quote.total,
    sameBatch: true,
  };
  const second: VoiceEmailQuoteChoice = {
    ...first,
    id: "44444444-4444-4444-4444-444444444444",
    number: "DEV-2026-002",
    title: "Peinture de la chambre",
  };

  assert.equal(suggestedVoiceQuoteId({
    subject: "Votre devis",
    body: "Bonjour, voici votre devis.",
    quotes: [first],
  }), quote.id);
  assert.equal(suggestedVoiceQuoteId({
    subject: "Votre projet de rénovation",
    body: "Nous avons préparé votre projet.",
    quotes: [first],
  }), null);
  assert.equal(suggestedVoiceQuoteId({
    subject: "Vos devis",
    body: "Vous trouverez nos propositions.",
    quotes: [first, second],
  }), null);
  assert.equal(suggestedVoiceQuoteId({
    subject: "DEV-2026-002",
    body: "Voici le document demandé.",
    quotes: [first, second],
  }), second.id);
});

test("un devis vocal peut générer une vraie pièce jointe PDF", async () => {
  const attachment = await buildVoiceEmailQuoteAttachment({
    quote,
    customer,
    organization,
    companyProfile: {
      version: 1,
      legalName: "Martin peinture",
      displayName: "Martin peinture",
      siret: "12345678901234",
      vatNumber: "FR00123456789",
      email: "contact@martin.test",
      phone: "04 00 00 00 00",
      address: "1 rue des Artisans",
      postalCode: "69000",
      city: "Lyon",
    },
    recipient: "julien.morel@exemple.com",
  });

  assert.equal(attachment.filename, "DEV-2026-001.pdf");
  const bytes = Buffer.from(attachment.content, "base64");
  assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 2_000);
});

test("un devis d’un autre destinataire ne peut jamais être joint", async () => {
  assert.throws(() => assertQuoteBelongsToRecipient("autre@exemple.com", customer.emails), /n’appartient pas au destinataire/);
  await assert.rejects(
    () => buildVoiceEmailQuoteAttachment({
      quote,
      customer,
      organization,
      recipient: "autre@exemple.com",
    }),
    /n’appartient pas au destinataire/,
  );
});
