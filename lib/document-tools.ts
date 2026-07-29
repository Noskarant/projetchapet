import type { Invoice, Quote } from "./project-chapet";
import { customerName } from "./project-chapet";

type BusinessDocument = Quote | Invoice;

function isQuote(document: BusinessDocument): document is Quote {
  return "title" in document;
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T12:00:00`));
}

export async function buildDocumentPdf(document: BusinessDocument) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("CHAPET SAS", margin, y);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Saint-Étienne · Loire", margin, y + 6);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(isQuote(document) ? "DEVIS" : "FACTURE", 194, y, { align: "right" });
  pdf.setFontSize(10);
  pdf.text(document.number, 194, y + 7, { align: "right" });
  y += 24;

  pdf.setDrawColor(210, 220, 232);
  pdf.line(margin, y, 194, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Client", margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(customerName(document.customer), margin, y + 6);
  const address = document.customer.addresses?.[0];
  const addressText = [address?.line1, address?.postal_code, address?.city].filter(Boolean).join(" · ");
  if (addressText) pdf.text(addressText, margin, y + 12);
  if (document.customer.siret) pdf.text(`SIRET : ${document.customer.siret}`, margin, y + 18);

  pdf.setFont("helvetica", "bold");
  pdf.text("Document", 120, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Émis le : ${date(document.issue_date)}`, 120, y + 6);
  pdf.text(isQuote(document) ? `Valable jusqu’au : ${date(document.expiry_date)}` : `Échéance : ${date(document.due_date)}`, 120, y + 12);
  if (isQuote(document)) pdf.text(`Objet : ${document.title}`, 120, y + 18, { maxWidth: 74 });
  y += 32;

  pdf.setFillColor(239, 245, 251);
  pdf.rect(margin, y, 178, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("Désignation", margin + 2, y + 6);
  pdf.text("Qté", 118, y + 6, { align: "right" });
  pdf.text("PU HT", 145, y + 6, { align: "right" });
  pdf.text("TVA", 162, y + 6, { align: "right" });
  pdf.text("Total HT", 192, y + 6, { align: "right" });
  y += 12;

  pdf.setFont("helvetica", "normal");
  for (const item of document.items) {
    if (y > 252) {
      pdf.addPage();
      y = 18;
    }
    const lines = pdf.splitTextToSize(item.label || "Prestation", 88);
    pdf.text(lines, margin + 2, y);
    if (item.description) {
      pdf.setTextColor(95, 108, 124);
      pdf.setFontSize(7.5);
      pdf.text(pdf.splitTextToSize(item.description, 88), margin + 2, y + 5);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(8.5);
    }
    pdf.text(`${item.quantity} ${item.unit || ""}`, 118, y, { align: "right" });
    pdf.text(money(item.unit_price), 145, y, { align: "right" });
    pdf.text(`${item.tax_rate} %`, 162, y, { align: "right" });
    pdf.text(money(item.total), 192, y, { align: "right" });
    y += Math.max(11, lines.length * 4.5 + (item.description ? 5 : 0));
    pdf.setDrawColor(235, 239, 244);
    pdf.line(margin, y - 4, 194, y - 4);
  }

  y += 4;
  const totalsX = 132;
  pdf.setFont("helvetica", "normal");
  pdf.text("Sous-total HT", totalsX, y);
  pdf.text(money(document.subtotal), 192, y, { align: "right" });
  y += 7;
  pdf.text("TVA", totalsX, y);
  pdf.text(money(document.tax_total), 192, y, { align: "right" });
  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Total TTC", totalsX, y);
  pdf.text(money(document.total), 192, y, { align: "right" });

  if (document.notes) {
    y += 14;
    pdf.setFontSize(9);
    pdf.text("Notes", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(pdf.splitTextToSize(document.notes, 175), margin, y + 6);
  }

  if (isQuote(document) && document.signature_data) {
    y = Math.max(y + 18, 235);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Accepté et signé par ${document.signer_name || "le client"}`, margin, y);
    try { pdf.addImage(document.signature_data, "PNG", margin, y + 4, 52, 22); } catch { /* image invalide */ }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Signature enregistrée le ${document.signed_at ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(document.signed_at)) : "—"}`, margin, y + 30);
  }

  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 110, 124);
  pdf.text("Document généré par le logiciel de gestion de l’entreprise.", 105, 288, { align: "center" });
  return pdf.output("blob");
}

export async function downloadDocumentPdf(document: BusinessDocument) {
  const blob = await buildDocumentPdf(document);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.number}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareDocumentPdf(document: BusinessDocument) {
  const blob = await buildDocumentPdf(document);
  const file = new File([blob], `${document.number}.pdf`, { type: "application/pdf" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: document.number, text: `Document ${document.number}`, files: [file] });
    return true;
  }
  return false;
}

export async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
