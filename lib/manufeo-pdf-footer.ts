import type {jsPDF} from 'jspdf';

export function drawManufeoPdfFooter(pdf:jsPDF,y:number,label='Généré avec MANUFEO'){
  pdf.setFont('helvetica','normal');pdf.setFontSize(6.5);
  const prefix=label.slice(0,label.indexOf('MANUFEO'));
  const prefixWidth=pdf.getTextWidth(prefix);
  pdf.setFont('helvetica','bold');const brandWidth=pdf.getTextWidth('MANUFEO');
  const x=105-(prefixWidth+brandWidth)/2;
  pdf.setFont('helvetica','normal');pdf.setTextColor(105,118,132);pdf.text(prefix,x,y);
  pdf.setFont('helvetica','bold');pdf.setTextColor(8,117,245);pdf.text('MANUFEO',x+prefixWidth,y);
  pdf.setDrawColor(8,117,245);pdf.setLineWidth(0.5);pdf.line(100,y+1.8,105,y+1.8);
  pdf.setDrawColor(255,122,26);pdf.line(105,y+1.8,110,y+1.8);
  pdf.setFont('helvetica','normal');pdf.setTextColor(105,118,132);
}
