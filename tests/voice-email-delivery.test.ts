import assert from "node:assert/strict";
import test from "node:test";
import { assertVoiceEmailRetry, reviewVoiceEmail, voiceEmailHtml, type VoiceEmailDelivery } from "../lib/voice-email-delivery";

const content = reviewVoiceEmail(" Alice@Exemple.fr ", "  Votre chantier  ", " Bonjour,\nMerci. ");
const base: VoiceEmailDelivery = {
  proposal_id: "draft-1", recipient: "alice@exemple.fr", subject: "Votre chantier", body: "Bonjour,\nMerci.",
  status: "sending", provider_id: null, sent_at: null,
  attachment_quote_id: null, attachment_filename: null, attachment_base64: null,
  created_at: "2026-09-29T09:00:00Z", updated_at: "2026-09-29T09:00:00Z",
};

test("le destinataire est validé et le contenu HTML ne peut pas injecter de balise", () => {
  assert.equal(content.recipient, "alice@exemple.fr");
  assert.throws(() => reviewVoiceEmail("sans-arobase", "Objet", "Texte"), /destinataire invalide/);
  const html = voiceEmailHtml("Bonjour <img src=x onerror=alert(1)> & merci");
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&amp; merci"));
  assert.ok(!html.includes("<img"));
});

test("un brouillon envoyé ou un contenu modifié ne peut pas partir deux fois", () => {
  assert.throws(() => assertVoiceEmailRetry({ ...base, status: "sent" }, content, null, Date.parse("2026-09-29T09:02:00Z")), /déjà été envoyé/);
  assert.throws(() => assertVoiceEmailRetry(base, { ...content, subject: "Autre objet" }, null, Date.parse("2026-09-29T09:02:00Z")), /même message/);
  assert.throws(() => assertVoiceEmailRetry(base, content, null, Date.parse("2026-09-29T09:00:20Z")), /déjà en cours/);
  assert.throws(() => assertVoiceEmailRetry(base, content, null, Date.parse("2026-10-01T09:00:00Z")), /vérifié/);
  assert.doesNotThrow(() => assertVoiceEmailRetry(base, content, null, Date.parse("2026-09-29T09:02:00Z")));

});

test("une relance conserve exactement la même pièce jointe", () => {
  const withAttachment: VoiceEmailDelivery = {
    ...base,
    attachment_quote_id: "11111111-1111-1111-1111-111111111111",
    attachment_filename: "DEV-2026-001.pdf",
    attachment_base64: "JVBERi0xLjQ=",
  };
  assert.doesNotThrow(() => assertVoiceEmailRetry(
    withAttachment,
    content,
    withAttachment.attachment_quote_id,
    Date.parse("2026-09-29T09:02:00Z"),
  ));
  assert.throws(
    () => assertVoiceEmailRetry(withAttachment, content, null, Date.parse("2026-09-29T09:02:00Z")),
    /autre pièce jointe/,
  );
});
