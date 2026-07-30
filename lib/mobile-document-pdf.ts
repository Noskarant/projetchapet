import type { MobileCustomer, MobileInvoice, MobileQuote } from "./mobile-prototype";
import { calculateQuotePreviewTotals, type QuoteInternalMeta } from "./mobile-quote-preview";
import type { CommercialCompanySettings } from "./mobile-commercial-demo";

export type MobileBusinessDocument = MobileQuote | MobileInvoice;

export type BusinessDocumentPdfOptions = {
  document: MobileBusinessDocument;
  customer: MobileCustomer | null;
  company: CommercialCompanySettings;
  quoteMeta?: QuoteInternalMeta;
  withoutPrices?: boolean;
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

const dateFr = (value: string) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
        new Date(`${value}T12:00:00`),
      )
    : "—";

export function isMobileQuote(document: MobileBusinessDocument): document is MobileQuote {
  return "expiryDate" in document;
}

export function documentFileName(document: MobileBusinessDocument, withoutPrices = false) {
  return `${document.number}${withoutPrices ? "-sans-prix" : ""}.pdf`;
}

export async function buildBusinessDocumentPdf({
  document,
  customer,
  company,
  quoteMeta = { discountPercent: 0, internalNotes: "" },
  withoutPrices = false,
}: BusinessDocumentPdfOptions) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const right = 195;
  let y = 16;
  const quote = isMobileQuote(document);
  const quoteTotals = quote
    ? calculateQuotePreviewTotals(document.items, quoteMeta.discountPercent)
    : null;
  const subtotal = quoteTotals?.subtotal ?? document.subtotal;
  const taxTotal = quoteTotals?.taxTotal ?? document.taxTotal;
  const total = quoteTotals?.total ?? document.total;

  const drawPageHeader = (continuation = false) => {
    pdf.setTextColor(17, 46, 72);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(company.displayName || company.legalName, margin, y);
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    const companyLine = [company.address, company.postalCode, company.city]
      .filter(Boolean)
      .join(" · ");
    if (companyLine) pdf.text(companyLine, margin, y + 5);
    const contactLine = [company.phone, company.email].filter(Boolean).join(" · ");
    if (contactLine) pdf.text(contactLine, margin, y + 10);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(
      quote ? "DEVIS" : document.status === "Avoir" ? "AVOIR" : "FACTURE",
      right,
      y,
      { align: "right" },
    );
    pdf.setFontSize(10);
    pdf.text(document.number, right, y + 7, { align: "right" });
    if (continuation) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text("Suite", right, y + 12, { align: "right" });
    }
    y += 22;
    pdf.setDrawColor(205, 218, 231);
    pdf.line(margin, y, right, y);
    y += 8;
  };

  const ensureSpace = (height: number, withHeader = true) => {
    if (y + height <= 278) return;
    pdf.addPage();
    y = 16;
    if (withHeader) drawPageHeader(true);
  };

  drawPageHeader();

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("CLIENT", margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(document.customerName, margin, y + 6);
  const customerAddress = customer
    ? [customer.address, customer.postalCode, customer.city].filter(Boolean).join(" · ")
    : "";
  if (customerAddress) {
    pdf.setFontSize(8.5);
    pdf.text(customerAddress, margin, y + 12, { maxWidth: 85 });
  }
  const customerContact = customer
    ? [customer.emails.find(Boolean), customer.phones.find(Boolean)].filter(Boolean).join(" · ")
    : "";
  if (customerContact) {
    pdf.setFontSize(8);
    pdf.text(customerContact, margin, y + 18, { maxWidth: 85 });
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("DOCUMENT", 116, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Émis le : ${dateFr(document.issueDate)}`, 116, y + 6);
  pdf.text(
    quote
      ? `Valable jusqu’au : ${dateFr(document.expiryDate)}`
      : `Échéance : ${dateFr(document.dueDate)}`,
    116,
    y + 12,
  );
  pdf.text(`Objet : ${document.title}`, 116, y + 18, { maxWidth: 79 });
  pdf.text(`Statut : ${document.status}`, 116, y + 24);
  y += 34;

  const drawTableHeader = () => {
    pdf.setFillColor(235, 243, 250);
    pdf.roundedRect(margin, y, 180, 9, 1.5, 1.5, "F");
    pdf.setTextColor(17, 46, 72);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("Désignation", margin + 3, y + 6);
    pdf.text("Qté", 120, y + 6, { align: "right" });
    if (!withoutPrices) {
      pdf.text("PU HT", 148, y + 6, { align: "right" });
      pdf.text("TVA", 165, y + 6, { align: "right" });
      pdf.text("Total HT", 192, y + 6, { align: "right" });
    }
    y += 14;
    pdf.setFont("helvetica", "normal");
  };

  drawTableHeader();
  document.items.forEach((item, index) => {
    const labelLines = pdf.splitTextToSize(item.label || `Prestation ${index + 1}`, 86);
    const descriptionLines = item.description
      ? pdf.splitTextToSize(item.description, 86)
      : [];
    const rowHeight = Math.max(12, labelLines.length * 4.2 + descriptionLines.length * 3.6 + 3);
    if (y + rowHeight > 270) {
      pdf.addPage();
      y = 16;
      drawPageHeader(true);
      drawTableHeader();
    }

    pdf.setTextColor(20, 42, 65);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(labelLines, margin + 3, y);
    if (descriptionLines.length) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(92, 109, 126);
      pdf.setFontSize(7.3);
      pdf.text(descriptionLines, margin + 3, y + labelLines.length * 4.2 + 1.5);
    }

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(20, 42, 65);
    pdf.setFontSize(8.5);
    pdf.text(`${item.quantity} ${item.unit || ""}`.trim(), 120, y, { align: "right" });
    if (!withoutPrices) {
      pdf.text(money(item.unitPrice), 148, y, { align: "right" });
      pdf.text(`${item.taxRate} %`, 165, y, { align: "right" });
      pdf.text(money(item.quantity * item.unitPrice), 192, y, { align: "right" });
    }
    y += rowHeight;
    pdf.setDrawColor(229, 235, 241);
    pdf.line(margin, y - 4, right, y - 4);
  });

  if (!withoutPrices) {
    ensureSpace(47);
    y += 4;
    const labelX = 129;
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    if (quoteTotals && quoteTotals.discountPercent > 0) {
      pdf.text("Sous-total HT", labelX, y);
      pdf.text(money(quoteTotals.grossSubtotal), 192, y, { align: "right" });
      y += 6;
      pdf.setTextColor(181, 72, 21);
      pdf.text(`Remise (${quoteTotals.discountPercent} %)`, labelX, y);
      pdf.text(`- ${money(quoteTotals.discountAmount)}`, 192, y, { align: "right" });
      pdf.setTextColor(20, 42, 65);
      y += 6;
    }
    pdf.text("Total HT", labelX, y);
    pdf.text(money(subtotal), 192, y, { align: "right" });
    y += 6;
    pdf.text("TVA", labelX, y);
    pdf.text(money(taxTotal), 192, y, { align: "right" });
    y += 7;
    pdf.setFillColor(17, 46, 72);
    pdf.roundedRect(126, y - 5, 69, 12, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text("TOTAL TTC", 130, y + 2.5);
    pdf.text(money(total), 192, y + 2.5, { align: "right" });
    pdf.setTextColor(20, 42, 65);
    y += 17;
  } else {
    ensureSpace(20);
    y += 5;
    pdf.setFillColor(239, 245, 250);
    pdf.roundedRect(margin, y - 5, 180, 12, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("DOCUMENT CHANTIER SANS PRIX", margin + 4, y + 2.5);
    y += 14;
  }

  if (document.notes.trim()) {
    const noteLines = pdf.splitTextToSize(document.notes.trim(), 174);
    ensureSpace(noteLines.length * 4 + 16);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("NOTES CLIENT", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(noteLines, margin, y + 6);
    y += noteLines.length * 4 + 12;
  }

  ensureSpace(48);
  pdf.setDrawColor(210, 220, 231);
  pdf.roundedRect(margin, y, 180, quote ? 37 : 29, 2, 2);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text(quote ? "BON POUR ACCORD" : "CONDITIONS DE RÈGLEMENT", margin + 4, y + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  if (quote) {
    pdf.text("Date :", margin + 4, y + 15);
    pdf.text("Nom et signature précédés de la mention « Bon pour accord » :", margin + 4, y + 22);
  } else {
    pdf.text(company.paymentTerms || "Paiement selon les conditions convenues.", margin + 4, y + 15, {
      maxWidth: 170,
    });
  }

  const footer = `${company.legalName} · SIRET ${company.siret} · TVA ${company.vat}`;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(105, 118, 132);
  pdf.setFontSize(7);
  pdf.text(footer, 105, 286, { align: "center", maxWidth: 180 });
  pdf.text("Les notes personnelles internes sont exclues de ce document.", 105, 290, {
    align: "center",
  });

  return pdf.output("blob");
}
