import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBusinessDocumentPdf,
  businessDocumentTypeLabel,
  documentFileName,
  type BusinessDocumentCompany,
} from "../lib/mobile-document-pdf";
import type { LineItem, MobileCustomer, MobileInvoice, MobileQuote } from "../lib/mobile-prototype";
import { normalizeCompanyProfile } from "../lib/company-profile";
import { buildDocumentPdf } from '../lib/document-tools';
import type { Quote } from '../lib/project-chapet';

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

test('les PDF montrent la pièce en titre et les prestations en dessous sans altérer les montants', async () => {
  const items: LineItem[] = [
    { id: '1', label: 'Ouverture de chantier', description: 'Ouverture de chantier', quantity: 1, unit: 'forfait', unitPrice: 30, taxRate: 10 },
    { id: '2', label: 'Chambre étage sud - Peinture plafond', description: 'Chambre étage sud - Plafond : Préparation et mise en peinture mat à deux couches', quantity: 42.08, unit: 'm²', unitPrice: 22.5, taxRate: 10 },
    { id: '3', label: 'Petite chambre - Peinture plafond', description: 'Petite chambre - Plafond : Préparation et mise en peinture mat à deux couches', quantity: 1, unit: 'm²', unitPrice: 22.3, taxRate: 10 },
  ];
  const mobile = { ...quote, title: 'Peinture', items, notes: '', subtotal: 999.1, taxTotal: 99.91, total: 1099.01 };
  const desktop: Quote = {
    id: 'quote-1', organization_id: 'org', customer_id: 'customer-1', number: quote.number,
    title: 'Peinture', status: 'draft', issue_date: '2026-10-10', expiry_date: '2026-11-10',
    subtotal: 999.1, tax_total: 99.91, total: 1099.01, notes: '', sent_at: null, accepted_at: null,
    created_at: '', updated_at: '',
    customer: { id: 'customer-1', organization_id: 'org', kind: 'individual', company_name: null, civility: null, last_name: 'ROYER', first_name: 'Huguette', emails: [], phones: [], addresses: [], notes: null, siret: null, vat_number: null, created_at: '', updated_at: '' },
    items: items.map((item, position) => ({ id: item.id, position, label: item.label, description: item.description, quantity: Number(item.quantity), unit: item.unit, unit_price: Number(item.unitPrice), tax_rate: Number(item.taxRate), total: Number(item.quantity) * Number(item.unitPrice) })),
  };
  const before = JSON.stringify({ mobile, desktop });
  const blobs = [
    await buildBusinessDocumentPdf({ document: mobile, customer, company }),
    await buildDocumentPdf(desktop),
  ];
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const blob of blobs) {
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      const content = await (await pdf.getPage(1)).getTextContent();
      const chunks = content.items.filter(item => 'str' in item);
      const text = chunks.map(item => item.str).join(' ');
      assert.equal(chunks.filter(item => item.str === 'Chambre étage sud').length, 1);
      assert.equal(chunks.filter(item => item.str === 'Petite chambre').length, 1);
      assert.equal(chunks.filter(item => item.str === 'Ouverture de chantier').length, 1);
      assert.doesNotMatch(text, /Chambre étage sud - Peinture plafond/);
      const heading = chunks.find(item => item.str === 'Chambre étage sud')!;
      const detail = chunks.find(item => item.str.startsWith('Plafond :'))!;
      assert.ok(heading.transform[5] > detail.transform[5], 'La prestation apparaît sous la localisation');
      assert.notEqual(heading.fontName, detail.fontName, 'Le titre est en gras, le détail en texte normal');
      assert.match(text, /999,10/); assert.match(text, /99,91/); assert.match(text, /1 099,01/);
    } finally { await task.destroy(); }
  }
  assert.equal(JSON.stringify({ mobile, desktop }), before);
});

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

for (const kind of ["quote", "invoice", "credit"] as const) {
  test(`PDF ${kind} : logo intégré et montants français lisibles au-delà de mille euros`, async () => {
    const sign = kind === "credit" ? -1 : 1;
    const base = kind === "quote" ? quote : kind === "credit" ? { ...invoice, status: "Avoir" as const } : invoice;
    const document = {
      ...base,
      notes: "",
      items: [{ ...items[0], label: "Peinture plafond", description: "", quantity: sign * 18.5, unitPrice: 1100 }],
      subtotal: sign * 20350, taxTotal: sign * 2035, total: sign * 22385,
    };
    const profile = normalizeCompanyProfile({
      displayName: "Entreprise exemple",
      logoDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAAAgCAIAAAAKUWg7AAAARklEQVR4nO3PAQ3AIADAMMABRtCBf0V38Sd7q2Cb+9zxJ+vrgLcZrjNcZ7jOcJ3hOsN1husM1xmuM1xnuM5wneE6w3WG6x7E2ADHyF5+NQAAAABJRU5ErkJggg==",
    });
    const blob = await buildBusinessDocumentPdf({ document, customer, company, profile });
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const chunks = content.items.filter(item => "str" in item);
      const text = chunks.map(item => item.str).join(" ");
      const prefix = sign < 0 ? "-" : "";
      assert.ok(text.includes(`${prefix}20 350,00 €`), text);
      assert.ok(text.includes(`${prefix}22 385,00 €`), text);
      assert.ok(text.includes("1 100,00 €"), text);
      assert.ok(text.includes(`${prefix}18,5 m²`), text);
      const operators = await page.getOperatorList();
      assert.ok(operators.fnArray.includes(OPS.paintImageXObject), "Le logo doit être incorporé au PDF");
      for (const item of chunks.filter(item => item.str.includes("€"))) {
        assert.ok(item.transform[4] + item.width <= 195 * 72 / 25.4, `Montant hors de sa marge : ${item.str} (fin ${item.transform[4] + item.width})`);
      }
    } finally { await task.destroy(); }
  });
}

test("les grands totaux restent dans leur encadré sans chevaucher le libellé", async () => {
  const blob = await buildBusinessDocumentPdf({
    document: { ...invoice, items: [{ ...items[0], quantity: 1, unitPrice: 1234567890.12 }], subtotal: 1234567890.12, taxTotal: 123456789.01, total: 1358024679.13, notes: "" },
    customer, company,
  });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const content = await (await (await task.promise).getPage(1)).getTextContent();
    const chunks = content.items.filter(item => "str" in item);
    const label = chunks.find(item => item.str === "TOTAL TTC")!;
    const amount = chunks.find(item => item.str === "1 358 024 679,13 €")!;
    assert.ok(amount, "Le montant TTC doit être lisible et complet");
    assert.ok(amount.transform[4] > label.transform[4] + label.width + 2, "Le montant ne doit pas chevaucher TOTAL TTC");
    assert.ok(amount.transform[4] + amount.width <= 195 * 72 / 25.4, `Le montant doit rester dans l’encadré (fin ${amount.transform[4] + amount.width})`);
  } finally { await task.destroy(); }
});
