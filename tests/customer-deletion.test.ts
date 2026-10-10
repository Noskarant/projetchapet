import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { deleteCustomerRecord, deleteSyncedMobileCustomer } from "../lib/customer-deletion";
import { CUSTOMER_DOCUMENTS_DELETE_ERROR, deleteCustomerFromWorkspace, seedMobileWorkspace, type MobileWorkspace } from "../lib/mobile-prototype";

const customerId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";

function backend(status: number, response: unknown) {
  const requests: { url: URL; method: string | undefined; prefer: string | null }[] = [];
  const client = createClient("https://customer-deletion.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), method: init?.method, prefer: new Headers(init?.headers).get("Prefer") });
      return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, requests };
}

function workspace(id = customerId): MobileWorkspace {
  const seed = seedMobileWorkspace();
  const customer = { ...seed.customers[0], id };
  return { ...seed, customers: [customer, { ...customer, id: organizationId }], quotes: [], invoices: [], agenda: [] };
}

test("la suppression vise un seul identifiant dans son organisation et exige sa confirmation", async () => {
  const { client, requests } = backend(200, [{ id: customerId }]);
  await deleteCustomerRecord(client, customerId, organizationId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "DELETE");
  assert.equal(requests[0].url.pathname, "/rest/v1/customers");
  assert.equal(requests[0].url.searchParams.get("id"), `eq.${customerId}`);
  assert.equal(requests[0].url.searchParams.get("organization_id"), `eq.${organizationId}`);
  assert.equal(requests[0].url.searchParams.get("select"), "id");
  assert.match(requests[0].prefer ?? "", /return=representation/);
});

test("une référence serveur, y compris une facture archivée, bloque la suppression avec un message clair", async () => {
  const { client } = backend(409, { code: "23503", message: 'update or delete violates invoices_customer_id_fkey', details: null, hint: null });
  await assert.rejects(deleteCustomerRecord(client, customerId, organizationId), { message: CUSTOMER_DOCUMENTS_DELETE_ERROR });
});

test("un client masqué par les droits ou introuvable ne produit pas de faux succès", async () => {
  const { client } = backend(200, []);
  await assert.rejects(deleteCustomerRecord(client, customerId, organizationId), /suppression n’a pas été confirmée/);
});

test("le refus explicite des droits ne prétend pas que le client possède des documents", async () => {
  const { client } = backend(403, { code: "42501", message: "permission denied", details: null, hint: null });
  await assert.rejects(deleteCustomerRecord(client, customerId, organizationId), /droits nécessaires/);
});

test("une erreur serveur conserve un message de réessai sans annoncer une suppression", async () => {
  const { client } = backend(500, { code: "XX000", message: "server error", details: null, hint: null });
  await assert.rejects(deleteCustomerRecord(client, customerId, organizationId), /suppression du client a échoué/);
});

test("supprimer un doublon sans document conserve l’autre homonyme et toutes les autres données", () => {
  const before = workspace();
  const snapshot = structuredClone(before);
  const after = deleteCustomerFromWorkspace(before, customerId);
  assert.deepEqual(after.customers, [before.customers[1]]);
  assert.equal(after.quotes, before.quotes);
  assert.equal(after.invoices, before.invoices);
  assert.equal(after.agenda, before.agenda);
  assert.deepEqual(before, snapshot);
});

test("les devis et les factures locaux protègent chacun leur client sans modifier le dossier", () => {
  const seed = seedMobileWorkspace();
  for (const kind of ["quotes", "invoices"] as const) {
    const before = workspace();
    if (kind === "quotes") before.quotes = [{ ...seed.quotes[0], customerId }];
    else before.invoices = [{ ...seed.invoices[0], customerId }];
    const snapshot = structuredClone(before);
    assert.throws(() => deleteCustomerFromWorkspace(before, customerId), { message: CUSTOMER_DOCUMENTS_DELETE_ERROR });
    assert.deepEqual(before, snapshot);
  }
});

test("le mobile attend la sauvegarde puis utilise l’identifiant serveur avant le retrait local", async () => {
  let current = workspace("customer-local");
  const order: string[] = [];
  const aliases: Record<string, string> = {};
  await deleteSyncedMobileCustomer({
    id: "customer-local", readWorkspace: () => current, resolveId: id => aliases[id] ?? id,
    flush: async scope => {
      order.push("flush");
      assert.deepEqual(scope, { entity: "customer", id: "customer-local" });
      aliases["customer-local"] = customerId;
      current = workspace();
    },
    removeCloud: async id => { assert.equal(id, customerId); order.push("cloud"); assert.equal(current.customers.length, 2); },
    commit: id => { order.push("local"); current = deleteCustomerFromWorkspace(current, id); },
  });
  assert.deepEqual(order, ["flush", "cloud", "local"]);
  assert.deepEqual(current.customers.map(customer => customer.id), [organizationId]);
});

test("les échecs de sauvegarde et de suppression cloud laissent la fiche locale en place", async () => {
  for (const failure of ["flush", "cloud"] as const) {
    const current = workspace();
    let committed = false;
    await assert.rejects(deleteSyncedMobileCustomer({
      id: customerId, readWorkspace: () => current, resolveId: id => id,
      flush: async () => { if (failure === "flush") throw new Error("offline"); },
      removeCloud: async () => { throw new Error(CUSTOMER_DOCUMENTS_DELETE_ERROR); },
      commit: () => { committed = true; },
    }));
    assert.equal(committed, false);
    assert.equal(current.customers.length, 2);
  }
});

test("un identifiant non synchronisé n’est jamais supprimé uniquement en local", async () => {
  let deleted = false;
  const current = workspace("customer-local");
  await assert.rejects(deleteSyncedMobileCustomer({
    id: "customer-local", readWorkspace: () => current, resolveId: id => id,
    flush: async () => {}, removeCloud: async () => { deleted = true; }, commit: () => { deleted = true; },
  }), /sauvegarde du client est encore en attente/);
  assert.equal(deleted, false);
});

test("un document apparu pendant la sauvegarde bloque aussi la suppression mobile", async () => {
  const current = workspace();
  let deleted = false;
  await assert.rejects(deleteSyncedMobileCustomer({
    id: customerId, readWorkspace: () => current, resolveId: id => id,
    flush: async () => { current.quotes.push({ ...seedMobileWorkspace().quotes[0], customerId }); },
    removeCloud: async () => { deleted = true; }, commit: () => { deleted = true; },
  }), { message: CUSTOMER_DOCUMENTS_DELETE_ERROR });
  assert.equal(deleted, false);
});
