import assert from "node:assert/strict";
import test from "node:test";
import {
  electronicInvoiceBlockingReason,
  invoiceDeliveryLabel,
} from "../lib/mobile-invoice-delivery";

test("le libellé d’envoi distingue client, comptable et double envoi", () => {
  assert.equal(invoiceDeliveryLabel(false, false), "Pas encore envoyée");
  assert.equal(invoiceDeliveryLabel(true, false), "Envoyée au client");
  assert.equal(invoiceDeliveryLabel(false, true), "Envoyée au comptable");
  assert.equal(invoiceDeliveryLabel(true, true), "Envoyée au client et au comptable");
});

test("une facture brouillon explique pourquoi la facture électronique ne peut pas partir", () => {
  assert.match(electronicInvoiceBlockingReason("Brouillon"), /brouillon/i);
});

test("une facture émise, en cours ou payée reste transmissible électroniquement", () => {
  assert.equal(electronicInvoiceBlockingReason("En cours"), "");
  assert.equal(electronicInvoiceBlockingReason("Payée"), "");
  assert.equal(electronicInvoiceBlockingReason("Émise"), "");
});

test("un avoir n’emprunte pas le flux d’une facture électronique classique", () => {
  assert.match(electronicInvoiceBlockingReason("Avoir"), /avoir/i);
});
