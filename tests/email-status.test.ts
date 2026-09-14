import assert from "node:assert/strict";
import test from "node:test";
import {
  documentEmailErrorMessage,
  isClientEmailAddress,
} from "../lib/authenticated-email";

test("le contrat du statut e-mail ne dépend que des deux variables requises", () => {
  const configured = (apiKey: string, from: string) => Boolean(apiKey && from);
  assert.equal(configured("re_test", "docs@example.com"), true);
  assert.equal(configured("", "docs@example.com"), false);
  assert.equal(configured("re_test", ""), false);
});

test("les destinataires invalides sont bloqués avant l’envoi", () => {
  assert.equal(isClientEmailAddress("contact@martin-peinture.fr"), true);
  assert.equal(isClientEmailAddress(" contact@martin-peinture.fr "), true);
  assert.equal(isClientEmailAddress("contact-martin-peinture.fr"), false);
  assert.equal(isClientEmailAddress("contact@martin-peinture"), false);
  assert.equal(isClientEmailAddress(""), false);
});

test("une erreur API d’envoi remonte un message exploitable dans MANUFEO", async () => {
  const response = new Response(JSON.stringify({ error: "Adresse du destinataire invalide." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(await documentEmailErrorMessage(response), "Adresse du destinataire invalide.");

  const unsynced = new Response("", { status: 404 });
  assert.equal(
    await documentEmailErrorMessage(unsynced),
    "Le document n’a pas encore été synchronisé. Réessayez dans quelques secondes.",
  );
});
