import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassicDocumentEmail,
  documentEmailTextFromHtml,
} from "../lib/document-email-template";

test("le mail client supprime le logo cassé, l'ancien branding et la signature dupliquée", () => {
  const input = `
    <img src="data:image/png;base64,abc" alt="Logo">
    <div style="font-family:Arial;white-space:pre-line">
      Bonjour,<br><br>
      Veuillez trouver ci-joint votre document. Merci de votre confiance.<br><br>
      Devis DEV-2026-001.<br><br>
      Cordialement,<br>
      Martin Peinture
    </div>
    <div style="margin-top:18px;font-weight:700">Martin Peinture</div>
    <div>Envoyé via FORGEO.</div>
  `;

  const result = buildClassicDocumentEmail(input);
  assert.match(result.text, /^Bonjour,/);
  assert.equal((result.text.match(/Martin Peinture/g) || []).length, 1);
  assert.doesNotMatch(result.text, /FORGEO|Envoyé via/i);
  assert.doesNotMatch(result.html, /<img|data:image|FORGEO/i);
  assert.match(result.html, /font-family:Arial,Helvetica,sans-serif/);
  assert.match(result.html, /<p style=/);
});

test("le template fournit une version texte et échappe le HTML saisi", () => {
  const result = buildClassicDocumentEmail("<div>Bonjour,<br><br>&lt;script&gt;test&lt;/script&gt;</div>");
  assert.equal(result.text, "Bonjour,\n\n<script>test</script>");
  assert.doesNotMatch(result.html, /<script>test<\/script>/);
  assert.match(result.html, /&lt;script&gt;test&lt;\/script&gt;/);
});

test("la conversion conserve des paragraphes lisibles", () => {
  assert.equal(
    documentEmailTextFromHtml("<p>Bonjour,</p><p>Votre facture est jointe.</p><p>Cordialement,<br>Entreprise Martin</p>"),
    "Bonjour,\n\nVotre facture est jointe.\n\nCordialement,\nEntreprise Martin",
  );
});
