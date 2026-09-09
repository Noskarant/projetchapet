import assert from "node:assert/strict";
import test from "node:test";
import {
  recipientsAreAuthorized,
  snapshotRecipientsForDocument,
  uniqueValidEmails,
} from "../lib/email-authorization";

const snapshot = {
  workspace: {
    customers: [
      { id: "C-1", emails: ["Client@Example.fr", "second@example.fr"] },
      { id: "C-2", emails: ["other@example.fr"] },
    ],
    quotes: [{ number: "D-2026-001", customerId: "C-1" }],
    invoices: [{ number: "F-2026-001", customerId: "C-2" }],
  },
  company_profile: { accountingEmail: "Compta@Cabinet.fr" },
};

test("un devis autorise uniquement les e-mails de son client et la comptabilité", () => {
  const result = snapshotRecipientsForDocument(snapshot, "D-2026-001", "quote");
  assert.equal(result.found, true);
  assert.deepEqual(result.emails.sort(), ["client@example.fr", "compta@cabinet.fr", "second@example.fr"].sort());
  assert.equal(recipientsAreAuthorized(["client@example.fr", "compta@cabinet.fr"], result.emails), true);
  assert.equal(recipientsAreAuthorized(["other@example.fr"], result.emails), false);
  assert.equal(recipientsAreAuthorized(["intrus@example.fr"], result.emails), false);
});

test("une facture ne donne pas accès aux destinataires d’un autre client", () => {
  const result = snapshotRecipientsForDocument(snapshot, "F-2026-001", "invoice");
  assert.equal(result.found, true);
  assert.equal(recipientsAreAuthorized(["other@example.fr"], result.emails), true);
  assert.equal(recipientsAreAuthorized(["client@example.fr"], result.emails), false);
});

test("un numéro absent ne peut pas autoriser un envoi", () => {
  const result = snapshotRecipientsForDocument(snapshot, "D-2026-999", "quote");
  assert.deepEqual(result, { found: false, emails: [] });
});

test("les adresses invalides sont ignorées et les doublons normalisés", () => {
  assert.deepEqual(
    uniqueValidEmails([" TEST@EXAMPLE.FR ", "test@example.fr", "invalide", ""]),
    ["test@example.fr"],
  );
});
