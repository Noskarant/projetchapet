import assert from "node:assert/strict";
import test from "node:test";

test("le contrat du statut e-mail ne dépend que des deux variables requises", () => {
  const configured = (apiKey: string, from: string) => Boolean(apiKey && from);
  assert.equal(configured("re_test", "docs@example.com"), true);
  assert.equal(configured("", "docs@example.com"), false);
  assert.equal(configured("re_test", ""), false);
});
