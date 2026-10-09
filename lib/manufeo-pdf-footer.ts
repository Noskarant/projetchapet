import type {jsPDF} from 'jspdf';
import { MANUFEO_PDF_MARK } from './manufeo-pdf-brand';

export function drawManufeoPdfFooter(pdf: jsPDF, y: number, label = 'Généré avec MANUFEO') {
  const prefix = label.slice(0, label.indexOf('MANUFEO'));
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
  const prefixWidth = pdf.getTextWidth(prefix);
  pdf.setFont('helvetica', 'bold');
  const brandWidth = pdf.getTextWidth('MANUFEO');
  const markWidth = 5, gap = 1.5;
  const x = 105 - (prefixWidth + markWidth + gap + brandWidth) / 2;
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(105, 118, 132);
  pdf.text(prefix, x, y);
  pdf.addImage(MANUFEO_PDF_MARK, 'PNG', x + prefixWidth, y - 4, markWidth, markWidth, 'manufeo-brand', 'FAST');
  pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17, 46, 72);
  pdf.text('MANUFEO', x + prefixWidth + markWidth + gap, y);
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(105, 118, 132);
}
