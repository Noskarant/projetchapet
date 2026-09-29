import test from "node:test";
import assert from "node:assert/strict";
import { filterAgenda, type MobileCustomer } from "../lib/mobile-prototype";
import { voiceAgendaEntry, voiceEmailDraft } from "../lib/voice-action-history";

const customer: MobileCustomer = {
  id: "customer-1", kind: "Particulier", companyName: "", civility: "", firstName: "Alice", lastName: "Martin",
  emails: [], phones: [], address: "", postalCode: "", city: "", siret: "", vat: "", notes: "",
};

test("un rendez-vous vocal exécuté réapparaît dans l'agenda, même après la semaine courante", () => {
  const entry = voiceAgendaEntry({
    id: "proposal-1", created_at: "2026-09-29T10:00:00Z",
    payload: { date: "2026-10-20", time: "14:30", title: "Visite du chantier", location: "Lyon", notes: "Prévoir les plans", customer_hint: "Alice Martin", type: "Chantier" },
  }, [customer]);
  assert.ok(entry);
  assert.equal(entry.id, "voice-proposal-1");
  assert.equal(entry.customerId, "customer-1");
  assert.match(entry.title, /Lyon.*Prévoir les plans/);
  assert.deepEqual(filterAgenda([entry], "all", new Date("2026-09-29T12:00:00Z")), [entry]);
  assert.deepEqual(filterAgenda([entry], "week", new Date("2026-09-29T12:00:00Z")), []);
});

test("un brouillon vocal exécuté conserve destinataire, objet et message", () => {
  const draft = voiceEmailDraft({
    id: "proposal-2", created_at: "2026-09-29T10:00:00Z",
    payload: { to: "alice@example.fr", subject: "Votre devis", body: "Bonjour Alice,\nVoici votre devis." },
  });
  assert.deepEqual(draft, { id: "proposal-2", to: "alice@example.fr", subject: "Votre devis", body: "Bonjour Alice,\nVoici votre devis.", createdAt: "2026-09-29T10:00:00Z" });
});
