import assert from "node:assert/strict";
import test from "node:test";
import { applyMobileVoiceCommand, fallbackMobileVoiceCommand } from "../lib/mobile-voice-command";
import { seedMobileWorkspace } from "../lib/mobile-prototype";

test("modifie une ligne de devis et son statut sans toucher aux autres lignes", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes.find((item) => item.id === "Q-378");
  assert.ok(quote);

  const updated = applyMobileVoiceCommand(workspace, {
    entity: "quote",
    id: quote.id,
    summary: "Prix et statut modifiés",
    changes: { status: "Validé" },
    line_operations: [{ action: "update", match: "peinture séjour", prix_unitaire_ht: 42, taux_tva: 10 }],
  });

  const result = updated.quotes.find((item) => item.id === quote.id);
  assert.equal(result?.status, "Validé");
  assert.equal(result?.items.find((item) => /peinture séjour/i.test(item.label))?.unitPrice, 42);
  assert.equal(result?.items.find((item) => /protection/i.test(item.label))?.unitPrice, 210);
});

test("ajoute et supprime des prestations à la voix", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  const updated = applyMobileVoiceCommand(workspace, {
    entity: "quote",
    id: quote.id,
    summary: "Sous-couche supprimée et main-d’œuvre ajoutée",
    line_operations: [
      { action: "delete", match: "protection et préparation" },
      { action: "add", designation: "Main-d’œuvre complémentaire", quantite: 5, unite: "h", prix_unitaire_ht: 45, taux_tva: 10 },
    ],
  });
  const result = updated.quotes.find((item) => item.id === quote.id);
  assert.equal(result?.items.some((item) => /protection/i.test(item.label)), false);
  assert.deepEqual(result?.items.find((item) => /main-d’œuvre/i.test(item.label)), {
    id: result?.items.find((item) => /main-d’œuvre/i.test(item.label))?.id,
    label: "Main-d’œuvre complémentaire",
    description: "",
    quantity: 5,
    unit: "h",
    unitPrice: 45,
    taxRate: 10,
  });
});

test("une facture marquée payée archive automatiquement son devis source", () => {
  const workspace = seedMobileWorkspace();
  const invoice = workspace.invoices.find((item) => item.sourceQuoteId === "Q-377");
  assert.ok(invoice);

  const updated = applyMobileVoiceCommand(workspace, {
    entity: "invoice",
    id: invoice.id,
    summary: "Facture réglée",
    changes: { status: "Payée" },
  });

  assert.equal(updated.invoices.find((item) => item.id === invoice.id)?.status, "Payée");
  assert.equal(updated.quotes.find((item) => item.id === "Q-377")?.status, "Terminé");
  assert.ok(updated.quotes.find((item) => item.id === "Q-377"));
});

test("modifie un événement d’agenda et son client", () => {
  const workspace = seedMobileWorkspace();
  const event = workspace.agenda[0];
  const updated = applyMobileVoiceCommand(workspace, {
    entity: "agenda",
    id: event.id,
    summary: "Rendez-vous déplacé",
    changes: {
      date: "2026-08-11",
      time: "14:30",
      title: "Rendez-vous de préparation",
      customer_name: "SCI BELLEVUE",
      type: "Chantier",
    },
  });
  const result = updated.agenda.find((item) => item.id === event.id);
  assert.equal(result?.date, "2026-08-11");
  assert.equal(result?.time, "14:30");
  assert.equal(result?.customerId, "C-002");
  assert.equal(result?.title, "Rendez-vous de préparation");
});

test("le secours local comprend une modification simple de prix", () => {
  const workspace = seedMobileWorkspace();
  const quote = workspace.quotes[0];
  const command = fallbackMobileVoiceCommand(
    "Sur la ligne peinture séjour, passe le prix à 35 euros et mets le devis en validé.",
    { entity: "quote", id: quote.id, data: quote },
    workspace,
  );
  assert.equal(command.changes?.status, "Validé");
  assert.equal(command.line_operations?.[0]?.action, "update");
  assert.equal(command.line_operations?.[0]?.prix_unitaire_ht, 35);
});
