import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/ai/parse/route";
import { plannedActionFromParsed } from "../lib/action-planner";

const transcript = "Crée un client particulier, nom Dupont, prénom Jean, email jean point dupont arobase mon tiret atelier point fr, téléphone 0612345678.";

function request() {
  return new Request("http://localhost/api/ai/parse", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "customer", target: "customer", transcript }),
  });
}

test("création client : l'adresse dictée traverse l'API puis le plan même si l'IA oublie l'arobase", async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "test-key";
  try {
    for (const email1 of ["jean point dupont arobase mon tiret atelier point fr", "jean.dupont.mon-atelier.fr", "jean.dupont mon-atelier.fr", ""]) {
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        assert.match(body.messages[1].content, /jean\.dupont@mon-atelier\.fr/);
        return Response.json({ choices: [{ message: { content: JSON.stringify({
          kind: "individual", last_name: "Dupont", first_name: "Jean", email1,
          warnings: ["L'adresse e-mail ne contient pas d'arobase.", "Adresse postale à compléter."],
        }) } }] });
      };
      const response = await POST(request());
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data.email1, "jean.dupont@mon-atelier.fr");
      assert.equal(data.email2, "");
      const action = plannedActionFromParsed("customer", data, transcript);
      assert.deepEqual(action.payload.emails, ["jean.dupont@mon-atelier.fr"]);
      assert.equal(action.status, "ready");
      assert.deepEqual(action.warnings, ["Adresse postale à compléter."]);
    }
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorKey;
  }
});

test("création client sans IA : conserve l'arobase et ne duplique pas l'adresse", async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const response = await POST(request());
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.email1, "jean.dupont@mon-atelier.fr");
    assert.equal(data.email2, "");
  } finally {
    if (priorKey !== undefined) process.env.DEEPSEEK_API_KEY = priorKey;
  }
});
