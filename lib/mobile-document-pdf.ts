import { documentInsurance } from "./document-insurance";
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
    const top = 15;
    const hasLogo = Boolean(logoDataUrl);
    const logoWidth = 27;
    const logoHeight = 12;
    if (hasLogo) {
      try {
        const format = logoDataUrl.startsWith("data:image/png")
          ? "PNG"
          : logoDataUrl.startsWith("data:image/webp")
            ? "WEBP"
            : "JPEG";
        const dimensions = pdf.getImageProperties(logoDataUrl);
        const ratio = Math.min(logoWidth / dimensions.width, logoHeight / dimensions.height);
        pdf.addImage(logoDataUrl, format, margin, top - 4, dimensions.width * ratio, dimensions.height * ratio, undefined, "FAST");
      } catch {
        // Un logo incompatible ne doit jamais empêcher la génération du document.
      }
    }

    const identityX = hasLogo ? margin + logoWidth + 5 : margin;
    const identityWidth = hasLogo ? 82 : 112;
    let leftY = top;
    pdf.setTextColor(17, 46, 72);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13.5);
    leftY = drawWrapped(identityName, identityX, leftY, identityWidth, 5.2);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.8);
    const companyLine = [address, postalCode, city].filter(Boolean).join(" · ");
    if (companyLine) leftY = drawWrapped(companyLine, identityX, leftY + 0.8, identityWidth, 3.6);
    const contactLine = [phone, email].filter(Boolean).join(" · ");
    if (contactLine) leftY = drawWrapped(contactLine, identityX, leftY + 0.6, identityWidth, 3.6);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(businessDocumentTypeLabel(document), right, top, { align: "right" });
    pdf.setFontSize(9.5);
    const numberLines = lines(document.number, 55);
    pdf.text(numberLines, right, top + 7, { align: "right" });
    let rightBottom = top + 7 + Math.max(1, numberLines.length) * 4;
    if (continuation) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.text("Suite", right, rightBottom + 1, { align: "right" });
      rightBottom += 5;
    }

    const logoBottom = hasLogo ? top - 4 + logoHeight : top;
    y = Math.max(leftY, rightBottom, logoBottom) + 5;
    pdf.setDrawColor(205, 218, 231);
    pdf.line(margin, y, right, y);
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
    const leftX = margin;
    const leftWidth = 86;
    const rightX = 112;
    const rightWidth = right - rightX;

    pdf.setTextColor(20, 42, 65);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.7);
    pdf.text("CLIENT", leftX, top);
    let leftY = top + 6;
    pdf.setFontSize(9.6);
    leftY = drawWrapped(document.customerName, leftX, leftY, leftWidth, 4.4);

    const customerAddress = customer
      ? [customer.address, customer.postalCode, customer.city].filter(Boolean).join(" · ")
      : "";
    if (customerAddress) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.1);
      leftY = drawWrapped(customerAddress, leftX, leftY + 1, leftWidth, 3.8);
    }
    const customerContact = customer
      ? [customer.emails.find(Boolean), customer.phones.find(Boolean)].filter(Boolean).join(" · ")
      : "";
    if (customerContact) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.8);
      leftY = drawWrapped(customerContact, leftX, leftY + 0.7, leftWidth, 3.6);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.7);
    pdf.text("DOCUMENT", rightX, top);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.1);
    let rightY = top + 6;
    rightY = drawWrapped(`Émis le : ${dateFr(document.issueDate)}`, rightX, rightY, rightWidth, 3.8);
    rightY = drawWrapped(
      quote
        ? `Valable jusqu’au : ${dateFr(document.expiryDate)}`
        : `Échéance : ${dateFr(document.dueDate)}`,
      rightX,
      rightY + 0.6,
      rightWidth,
      3.8,
    );
    rightY = drawWrapped(`Objet : ${document.title}`, rightX, rightY + 0.6, rightWidth, 3.8);
    rightY = drawWrapped(`Statut : ${document.status}`, rightX, rightY + 0.6, rightWidth, 3.8);

    for (const reference of documentInsurance(document.notes).references) {
      rightY = drawWrapped(reference, rightX, rightY + 0.6, rightWidth, 3.8);
    }
    y = Math.max(leftY, rightY) + 7;
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
  drawTableHeader();

  recalculatePercentageLines(document.items).forEach((item, index) => {
    // Measure with the exact font used to draw, leaving a gap before quantity.
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    const labelLines = lines(item.label || `Prestation ${index + 1}`, withoutPrices ? 145 : 82);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.3);
    const descriptionLines = item.description ? lines(item.description, withoutPrices ? 145 : 82) : [];
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
    drawFittedRight(item.quantity === null ? "À préciser" : `${quantity(item.quantity)} ${item.unit || ""}`.trim(), withoutPrices ? 192 : 120, numericY, withoutPrices ? 26 : 16);
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
    pdf.setDrawColor(229, 235, 241);
    pdf.line(margin, y - 2, right, y - 2);
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

  if (document.notes.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const noteLines = lines(document.notes.trim(), 174);
    ensureSpace(16);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("NOTES CLIENT", margin, y);
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

  if (quote) {
    ensureSpace(45);
    pdf.setDrawColor(210, 220, 231);
    pdf.roundedRect(margin, y, 180, 37, 2, 2);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("BON POUR ACCORD", margin + 4, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    pdf.text("Date :", margin + 4, y + 15);
    pdf.text("Nom et signature précédés de la mention « Bon pour accord » :", margin + 4, y + 22);
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
    const footerLines = footer ? lines(footer, 170) : [];
    const footerStart = 285 - Math.max(0, footerLines.length - 1) * 3.2;
    if (footerLines.length) pdf.text(footerLines, 105, footerStart, { align: "center" });
    pdf.setFontSize(6.5);
    pdf.text("Généré via MANUFEO · les notes personnelles internes sont exclues.", 105, 291, {
      align: "center",
    });
  }

  return pdf.output("blob");
}
