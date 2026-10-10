import { interventionNotes } from "./document-intervention-notes";
import { documentLinePresentation } from './document-line-presentation';
import { documentUnit } from "./document-units";
import { drawManufeoPdfFooter } from './manufeo-pdf-footer';
import { documentInsurance } from "./document-insurance";
import { phoneDisplay } from "./phone-display";
import { documentDeductible, isDeductibleLine } from "./document-deductible";
import { recalculatePercentageLines } from "./percentage-adjustments";
import type { MobileCustomer, MobileInvoice, MobileQuote } from "./mobile-prototype";
import { calculateQuotePreviewTotals, quoteTaxBreakdown, type QuoteInternalMeta } from "./mobile-quote-preview";
import { companyProfileDisplayName, readCompanyProfile, type CompanyProfile } from "./company-profile";

export type MobileBusinessDocument = MobileQuote | MobileInvoice;

export type BusinessDocumentCompany = {
  displayName?: string;
  legalName?: string;
  siret?: string;
  vat?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  paymentTerms?: string;
};

export type BusinessDocumentPdfOptions = {
  document: MobileBusinessDocument;
  customer: MobileCustomer | null;
  company: BusinessDocumentCompany;
  quoteMeta?: QuoteInternalMeta;
  withoutPrices?: boolean;
  profile?: CompanyProfile | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0)).replace(/[\u00a0\u202f]/g, " ");

const quantity = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 20 })
    .format(value).replace(/[\u00a0\u202f]/g, " ");

const dateFr = (value: string) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
        new Date(`${value}T12:00:00`),
      )
    : "—";

function activeCompanyProfile(): CompanyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    return readCompanyProfile(window.localStorage);
  } catch {
    return null;
  }
}

export function isMobileQuote(document: MobileBusinessDocument): document is MobileQuote {
  return "expiryDate" in document;
}

export function businessDocumentTypeLabel(document: MobileBusinessDocument) {
  if (isMobileQuote(document)) return "DEVIS";
  return document.status === "Avoir" ? "AVOIR" : "FACTURE";
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
  profile: suppliedProfile,
}: BusinessDocumentPdfOptions) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const profile = suppliedProfile === undefined ? activeCompanyProfile() : suppliedProfile;
  const identityName = profile
    ? companyProfileDisplayName(profile, company.displayName || company.legalName || "Votre entreprise")
    : company.displayName || company.legalName || "Votre entreprise";
  const legalName = profile?.legalName || company.legalName || identityName;
  const siret = profile?.siret || company.siret;
  const vat = profile?.vatNumber || company.vat;
  const address = profile?.address || company.address;
  const postalCode = profile?.postalCode || company.postalCode;
  const city = profile?.city || company.city;
  const phone = profile?.phone || company.phone;
  const email = profile?.email || company.email;
  const logoDataUrl = profile?.logoDataUrl || "";
  const margin = 15;
  const right = 195;
  const safeBottom = 266;
  let y = 15;
  const quote = isMobileQuote(document);
  const quoteTotals = quote
    ? calculateQuotePreviewTotals(document.items, quoteMeta.discountPercent)
    : null;
  const subtotal = quoteTotals?.subtotal ?? document.subtotal;
  const taxTotal = quoteTotals?.taxTotal ?? document.taxTotal;
  const total = quoteTotals?.total ?? document.total;

  // Standard PDF fonts do not encode the narrow no-break spaces emitted by
  // Intl in French. Measure and draw the same compatible text, and shrink
  // exceptional amounts inside their column instead of clipping them.
  const drawFittedRight = (value: string, x: number, baseline: number, width: number) => {
    const size = pdf.getFontSize();
    const text = value.replace(/[\u00a0\u202f]/g, " ");
    const measured = pdf.getTextWidth(text);
    if (measured > width) pdf.setFontSize(size * width / measured);
    pdf.text(text, x, baseline, { align: "right" });
    pdf.setFontSize(size);
  };

  const lines = (value: string, width: number) => {
    const normalized = String(value || "").replace(/[\u00a0\u202f]/g, " ").trim();
    if (!normalized) return [] as string[];
    const split = pdf.splitTextToSize(normalized, width) as string[] | string;
    return Array.isArray(split) ? split : [split];
  };

  const drawWrapped = (
    value: string,
    x: number,
    startY: number,
    width: number,
    lineHeight: number,
    options?: { align?: "left" | "right" | "center" },
  ) => {
    const wrapped = lines(value, width);
    if (!wrapped.length) return startY;
    pdf.text(wrapped, x, startY, { ...options, lineHeightFactor: lineHeight * pdf.internal.scaleFactor / pdf.getFontSize() });
    return startY + wrapped.length * lineHeight;
  };

  const drawPageHeader = (continuation = false) => {
    const top = 20;
    pdf.setTextColor(20, 42, 65);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(20);
    pdf.text(businessDocumentTypeLabel(document), margin, top);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    const numberBottom = drawWrapped(document.number, margin, top + 7, 130, 4.5);
    let logoBottom = top;
    if (logoDataUrl) {
      try {
        const format = logoDataUrl.startsWith("data:image/png") ? "PNG" : logoDataUrl.startsWith("data:image/webp") ? "WEBP" : "JPEG";
        const dimensions = pdf.getImageProperties(logoDataUrl);
        const ratio = Math.min(24 / dimensions.width, 24 / dimensions.height);
        const width = dimensions.width * ratio, height = dimensions.height * ratio;
        pdf.addImage(logoDataUrl, format, right - width, 13, width, height, undefined, "FAST");
        logoBottom = 13 + height;
      } catch { /* An incompatible logo must not prevent document generation. */ }
    }
    y = Math.max(numberBottom, logoBottom) + 8;
    if (continuation) {
      pdf.setFontSize(8);
      y = drawWrapped(`${identityName} - Suite`, margin, y, 180, 4) + 3;
    }
    pdf.setDrawColor(155, 165, 175); pdf.line(margin, y, right, y);
    y += 8;
  };

  const ensureSpace = (height: number, withHeader = true) => {
    if (y + height <= safeBottom) return;
    pdf.addPage();
    y = 15;
    if (withHeader) drawPageHeader(true);
  };

  const drawInformationBlocks = () => {
    const top = y;
    const text = (value: string, x: number, at: number, width: number, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(9);
      return drawWrapped(value, x, at, width, 4.2);
    };
    let datesY = text("Date d’émission", margin, top, 48);
    datesY = text(dateFr(document.issueDate), margin, datesY + 2, 48, true);
    datesY = text(quote ? "Date d’expiration" : "Échéance", margin, datesY + 5, 48);
    datesY = text(dateFr(quote ? document.expiryDate : document.dueDate), margin, datesY + 2, 48, true);
    let clientY = text("Client", 75, top, 55);
    clientY = text(document.customerName, 75, clientY + 2, 55, true);
    for (const value of [customer?.address, [customer?.postalCode, customer?.city].filter(Boolean).join(" "), customer?.emails.find(Boolean), ...[...new Set(customer?.phones.filter(Boolean) || [])].map(number => `Tél. : ${phoneDisplay(number)}`)]) {
      if (value) clientY = text(value, 75, clientY + 1, 55);
    }
    let companyY = text("De", 140, top, 55);
    companyY = text(identityName, 140, companyY + 2, 55, true);
    for (const value of [address, [postalCode, city].filter(Boolean).join(" "), email, phone ? `Tél. : ${phoneDisplay(phone)}` : '', siret ? `SIRET : ${siret}` : "", vat ? `N° de TVA : ${vat}` : ""]) {
      if (value) companyY = text(value, 140, companyY + 1, 55);
    }
    const bottom = Math.max(datesY, clientY, companyY) + 5;
    pdf.setDrawColor(155, 165, 175);
    pdf.line(70, top - 8, 70, bottom); pdf.line(135, top - 8, 135, bottom);
    pdf.line(margin, bottom, right, bottom);
    y = bottom + 10;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    y = drawWrapped(document.title, margin, y, 180, 4.2) + 4;
    for (const reference of documentInsurance(document.notes).references) {
      y = drawWrapped(reference, margin, y, 180, 4.2) + 1;
    }
    y += 5;
  };

  const drawTableHeader = () => {
    pdf.setFillColor(235, 243, 250);
    pdf.roundedRect(margin, y, 180, 9, 1.5, 1.5, "F");
    pdf.setTextColor(17, 46, 72);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("Désignation", margin + 3, y + 6);
    pdf.text("Qté", withoutPrices ? 192 : 120, y + 6, { align: "right" });
    if (!withoutPrices) {
      pdf.text("PU HT", 148, y + 6, { align: "right" });
      pdf.text("TVA", 165, y + 6, { align: "right" });
      pdf.text("Total HT", 192, y + 6, { align: "right" });
    }
    y += 14;
    pdf.setFont("helvetica", "normal");
  };

  drawPageHeader();
  drawInformationBlocks();
  const headerReferences = new Set(documentInsurance(document.notes).references.map(value => value.trim()));
  const clientNotes = interventionNotes(document.notes).split('\n').filter(line => !headerReferences.has(line.trim())).join('\n').trim();
  if (clientNotes) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const noteLines = lines(clientNotes, 174);
    ensureSpace(16);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("NOTE D’INTERVENTION", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    y += 6;
    for (const line of noteLines) {
      ensureSpace(5);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
      pdf.text(line, margin, y); y += 4;
    }
    y += 8;
  }

  drawTableHeader();

  recalculatePercentageLines(document.items).forEach((item, index) => {
    const presentation = documentLinePresentation(item, `Prestation ${index + 1}`);
    // Measure with the exact font used to draw, leaving a gap before quantity.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    const labelLines = lines(presentation.title, withoutPrices ? 145 : 82);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.3);
    const descriptionLines = lines(presentation.description, withoutPrices ? 145 : 82);
    const rowHeight = Math.max(12, labelLines.length * 4.2 + descriptionLines.length * 3.6 + 3);
    if (y + 12 > safeBottom || (y + rowHeight > safeBottom && rowHeight <= safeBottom - 70)) {
      pdf.addPage();
      y = 15;
      drawPageHeader(true);
      drawTableHeader();
    }

    const numericY = y;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(20, 42, 65);
    pdf.setFontSize(8.5);
    drawFittedRight(item.quantity === null ? "À préciser" : `${quantity(item.quantity)} ${documentUnit(item.unit) || ""}`.trim(), withoutPrices ? 192 : 120, numericY, withoutPrices ? 26 : 16);
    if (!withoutPrices) {
      drawFittedRight(item.unitPrice === null ? "À préciser" : money(item.unitPrice), 148, numericY, 24);
      drawFittedRight(item.taxRate === null ? "À préciser" : `${item.taxRate} %`, 165, numericY, 13);
      drawFittedRight(item.quantity === null || item.unitPrice === null ? "À préciser" : money(item.quantity * item.unitPrice), 192, numericY, 24);
    }
    // Very long descriptions continue on following pages instead of entering
    // totals/footer space. Numeric cells are printed once for the whole item.
    const textRows = [
      ...labelLines.map(text => ({ text, size: 8.5, font: "bold", height: 4.2 })),
      ...descriptionLines.map(text => ({ text, size: 7.3, font: "normal", height: 3.6 })),
    ];
    textRows.forEach((line, lineIndex) => {
      if (lineIndex === labelLines.length && descriptionLines.length) y += 1.5;
      if (y + line.height + 3 > safeBottom) {
        pdf.addPage(); y = 15; drawPageHeader(true); drawTableHeader();
      }
      pdf.setFont("helvetica", line.font);
      pdf.setFontSize(line.size);
      pdf.setTextColor(...(line.font === "bold" ? [20, 42, 65] : [92, 109, 126]) as [number, number, number]);
      pdf.text(line.text, margin + 3, y);
      y += line.height;
    });
    y += Math.max(5, 12 - Math.min(rowHeight, 12));
    // White space separates services cleanly; hairlines become irregular when
    // scaled by the mobile PDF canvas and can look like struck-through text.
  });

  if (!withoutPrices) {
    const taxLines = quoteTaxBreakdown(document.items, quoteMeta.discountPercent);
    const hasFranchiseLine = document.items.some(isDeductibleLine);
    const deductible = documentDeductible(hasFranchiseLine ? '' : document.notes, total);
    const insurance = documentInsurance(hasFranchiseLine ? '' : document.notes, total);
    const totalsHeight = (insurance.recovery !== null || deductible.amount > 0 ? 18 : 0) + (quoteTotals && quoteTotals.discountPercent > 0 ? 51 : 39) + Math.max(0, taxLines.length - 1) * 6;
    ensureSpace(totalsHeight);
    y += 4;
    const labelX = 129;
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    if (quoteTotals && quoteTotals.discountPercent > 0) {
      pdf.text("Sous-total HT", labelX, y);
      drawFittedRight(money(quoteTotals.grossSubtotal), 192, y, 30);
      y += 6;
      pdf.setTextColor(181, 72, 21);
      pdf.text(`Remise (${quoteTotals.discountPercent} %)`, labelX, y);
      drawFittedRight(`- ${money(quoteTotals.discountAmount)}`, 192, y, 30);
      pdf.setTextColor(20, 42, 65);
      y += 6;
    }
    pdf.text("Sous-total HT", labelX, y);
    drawFittedRight(money(subtotal), 192, y, 30);
    y += 6;
    if (taxLines.length) {
      taxLines.forEach((group, index) => {
        if (index) y += 6;
        pdf.text(`TVA (${new Intl.NumberFormat("fr-FR").format(group.rate)} %)`, labelX, y);
        drawFittedRight(money(group.amount), 192, y, 30);
      });
    } else {
      pdf.text("TVA", labelX, y);
      drawFittedRight(money(taxTotal), 192, y, 30);
    }
    y += 7;
    pdf.setFillColor(17, 46, 72);
    pdf.roundedRect(126, y - 5, 69, 12, 2, 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text("TOTAL TTC", 130, y + 2.5);
    drawFittedRight(money(total), 192, y + 2.5, 38);
    pdf.setTextColor(20, 42, 65);
    y += 17;
    if (insurance.recovery !== null) {
      pdf.setFontSize(8.5);
      drawFittedRight("Part client (franchise)", 159, y, 30);
      drawFittedRight(money(insurance.recovery), 192, y, 30);
      y += 7;
      drawFittedRight("Solde hors franchise", 159, y, 30);
      drawFittedRight(money(insurance.insurerShare || 0), 192, y, 30);
      y += 10;
    } else if (deductible.amount > 0) {
      pdf.setFontSize(8.5);
      pdf.text("Franchise TTC", labelX, y);
      drawFittedRight(`- ${money(deductible.amount)}`, 192, y, 30);
      y += 7;
      drawFittedRight("Montant après franchise", 159, y, 30);
      drawFittedRight(money(deductible.afterDeductible), 192, y, 30);
      y += 10;
    }
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

  if (withoutPrices && quoteMeta.teamInstructions?.trim()) {
    ensureSpace(16);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
    pdf.text('CONSIGNES ÉQUIPE', margin, y); y += 6;
    for (const line of lines(quoteMeta.teamInstructions, 174)) {
      ensureSpace(5); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      pdf.text(line, margin, y); y += 4;
    }
    y += 8;
  }


  if (quote) {
    ensureSpace(37);
    pdf.setDrawColor(210, 220, 231);
    pdf.roundedRect(margin, y, 180, 37, 2, 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("BON POUR ACCORD", margin + 4, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    pdf.text("Date :", margin + 4, y + 15);
    pdf.text("Nom et signature du client (manuscrite ou électronique) :", margin + 4, y + 22);
    y += 37;
  } else {
    const paymentText = company.paymentTerms || "Paiement selon les conditions convenues.";
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    const paymentLines = lines(paymentText, 170);
    const boxHeight = Math.max(29, 15 + paymentLines.length * 3.7);
    ensureSpace(boxHeight + 4);
    pdf.setDrawColor(210, 220, 231);
    pdf.roundedRect(margin, y, 180, boxHeight, 2, 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("CONDITIONS DE RÈGLEMENT", margin + 4, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    pdf.text(paymentLines, margin + 4, y + 15);
    y += boxHeight;
  }

  const footer = [legalName, siret ? `SIRET ${siret}` : "", vat ? `TVA ${vat}` : ""]
    .filter(Boolean)
    .join(" · ");
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(105, 118, 132);
    pdf.setFontSize(6.8);
    const footerLines = footer ? lines(footer, 160) : [];
    pdf.setDrawColor(155, 165, 175); pdf.line(margin, 278, right, 278);
    const footerStart = 285 - Math.max(0, footerLines.length - 1) * 3.2;
    if (footerLines.length) pdf.text(footerLines, margin, footerStart);
    pdf.text(`${page}/${pageCount}`, right, 285, { align: "right" });
    pdf.setFontSize(6.5);
    drawManufeoPdfFooter(pdf,291);
  }

  return pdf.output("blob");
}
