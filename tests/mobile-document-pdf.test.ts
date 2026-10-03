import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBusinessDocumentPdf,
  businessDocumentTypeLabel,
  documentFileName,
  type BusinessDocumentCompany,
} from "../lib/mobile-document-pdf";
import type { LineItem, MobileCustomer, MobileInvoice, MobileQuote } from "../lib/mobile-prototype";

const customer: MobileCustomer = {
  id: "customer-1",
  kind: "Professionnel",
  companyName: "SARL Martin Peinture et Rénovation Intérieure Très Longue Dénomination",
  civility: "",
  lastName: "",
  firstName: "",
  emails: ["contact-tres-long@martin-peinture-renovation-exemple.fr"],
  phones: ["06 12 34 56 78"],
  address: "123 avenue des Artisans et des Compagnons du Bâtiment",
  postalCode: "69000",
  city: "Lyon Métropole et alentours",
  siret: "12345678901234",
  vat: "FR00123456789",
  notes: "",
};

const company: BusinessDocumentCompany = {
  displayName: "ENTREPRISE NOÉ ANTÉRIEUX PEINTURE RÉNOVATION ET AMÉNAGEMENT INTÉRIEUR",
  legalName: "ANTÉRIEUX NOÉ ENTREPRISE INDIVIDUELLE",
  siret: "89004691500017",
  vat: "FR838383838",
  address: "29 rue Tupin, bâtiment B, atelier du fond de cour",
  postalCode: "69600",
  city: "Oullins-Pierre-Bénite",
  phone: "06 01 04 03 26",
  email: "contact-professionnel-tres-long@exemple-manufeo.fr",
  paymentTerms: "Paiement à 30 jours à compter de la date d’émission de la facture. Aucun escompte pour paiement anticipé.",
};

const items: LineItem[] = Array.from({ length: 32 }, (_, index) => ({
  id: `line-${index}`,
  label: `Préparation et peinture complète des murs et plafonds de la pièce numéro ${index + 1} avec protection des supports existants`,
  description: "Préparation minutieuse, rebouchage, ponçage, sous-couche et deux couches de finition selon les teintes choisies par le client.",
  quantity: 10 + index,
  unit: "m²",
  unitPrice: 28.5,
  taxRate: 10,
  incomplete: false,
  provenance: "user_explicit",
}));

const quote: MobileQuote = {
  id: "quote-1",
  number: "DEV-2026-001",
  customerId: customer.id,
  customerName: customer.companyName,
  title: "Rénovation complète d’un appartement avec une description volontairement très longue pour tester les retours à la ligne",
  issueDate: "2026-09-14",
  expiryDate: "2026-10-14",
  status: "En attente",
  items,
  notes: "Merci de prévoir un accès au chantier. Cette note client est suffisamment longue pour vérifier le retour automatique à la ligne sans collision avec les blocs suivants.",
  subtotal: 20000,
  taxTotal: 2000,
  total: 22000,
};

const invoice: MobileInvoice = {
  id: "invoice-1",
  number: "F-2026-001",
  customerId: customer.id,
  customerName: customer.companyName,
  title: quote.title,
  issueDate: "2026-09-14",
  dueDate: "2026-10-14",
  status: "En cours",
  items,
  notes: quote.notes,
  subtotal: 20000,
  taxTotal: 2000,
  total: 22000,
  paidTotal: 0,
  accountantSent: false,
};

test("les variantes devis, facture, avoir et chantier ont le bon libellé et nom de fichier", () => {
  assert.equal(businessDocumentTypeLabel(quote), "DEVIS");
  assert.equal(businessDocumentTypeLabel(invoice), "FACTURE");
  assert.equal(businessDocumentTypeLabel({ ...invoice, status: "Avoir" }), "AVOIR");
  assert.equal(documentFileName(quote), "DEV-2026-001.pdf");
  assert.equal(documentFileName(quote, true), "DEV-2026-001-sans-prix.pdf");
});

test("un devis long génère un PDF multi-pages sans erreur", async () => {
  const blob = await buildBusinessDocumentPdf({ document: quote, customer, company });
  assert.equal(blob.type, "application/pdf");
  assert.ok(blob.size > 5_000);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  assert.ok(pdf.numPages > 1);
  const allText: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      allText.push(item.str);
      assert.ok(item.transform[5] >= 0 && item.transform[5] <= page.view[3], `Texte hors page : ${item.str}`);
    }
  }
  assert.match(allText.join(" "), /Sous-total HT/);
  assert.match(allText.join(" "), /TVA \(10 %\)/);
  assert.match(allText.join(" "), /TOTAL TTC/);
  assert.match(allText.join(" "), /BON POUR ACCORD/);
  await task.destroy();
});

test("facture, avoir et version chantier utilisent le même générateur robuste", async () => {
  const [invoiceBlob, creditBlob, worksiteBlob] = await Promise.all([
    buildBusinessDocumentPdf({ document: invoice, customer, company }),
    buildBusinessDocumentPdf({ document: { ...invoice, status: "Avoir" }, customer, company }),
    buildBusinessDocumentPdf({ document: quote, customer, company, withoutPrices: true }),
  ]);

  for (const blob of [invoiceBlob, creditBlob, worksiteBlob]) {
    assert.equal(blob.type, "application/pdf");
    assert.ok(blob.size > 5_000);
  }
});


test('le PDF conserve HT, TVA, TTC et affiche la franchise séparément après TTC', async () => {
  const lines: LineItem[] = [
    {id:'1',label:'Peinture plafond',description:'',quantity:12,unit:'m²',unitPrice:22.4,taxRate:10},
    {id:'2',label:'Papier peint murs',description:'',quantity:12,unit:'m²',unitPrice:12,taxRate:10},
    {id:'3',label:'Rouleaux de papier peint',description:'',quantity:5,unit:'rouleaux',unitPrice:10,taxRate:10},
    {id:'4',label:'RSE (1 %)',description:'',quantity:1,unit:'forfait',unitPrice:4.63,taxRate:10},
  ];
  const blob = await buildBusinessDocumentPdf({document:{...quote,items:lines,notes:'Franchise à déduire du montant TTC : 150,00 €.'},customer,company});
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({data:new Uint8Array(await blob.arrayBuffer())});
  const pdf = await task.promise;
  const chunks:string[]=[];
  for(let number=1;number<=pdf.numPages;number++) {
    const content=await (await pdf.getPage(number)).getTextContent();
    for(const item of content.items) if('str' in item) chunks.push(item.str);
  }
  const text=chunks.join(' ');
  assert.match(text,/Sous-total HT.*467,43/);
  assert.match(text,/TVA \(10 %\).*46,74/);
  assert.match(text,/TOTAL TTC.*514,17/);
  assert.match(text,/Franchise TTC.*150,00.*Montant après franchise.*364,17/);
  await task.destroy();
});
