import type { CommercialProject } from './mobile-commercial-demo';
import { readQuoteSourceFiles } from './quote-source-files';

export async function buildProjectPhotoReport(project: CommercialProject, photoIds: string[], companyName: string, customerName: string, reportId: string) {
  const selected = project.photos.filter(photo => photoIds.includes(photo.id));
  if (!selected.length || selected.length !== new Set(photoIds).size) throw new Error('Sélectionnez au moins une photo disponible.');
  if (selected.length > 100) throw new Error('Maximum 100 photos par dossier.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  pdf.setFileId(reportId.slice(0, 32));
  const createdAt = new Date(selected[0].createdAt);
  if (!Number.isNaN(createdAt.getTime())) pdf.setCreationDate(createdAt);
  pdf.setProperties({ title: `Dossier photos · ${project.name}`, author: companyName, creator: 'MANUFEO' });
  const text = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
  for (let index = 0; index < selected.length; index++) {
    const photo = selected[index];
    if (!photo.dataUrl) throw new Error(`La photo « ${photo.name} » est indisponible. Resynchronisez le chantier.`);
    if (index) pdf.addPage();
    pdf.setTextColor(20, 42, 65); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    const heading = pdf.splitTextToSize(text(project.name), 178) as string[];
    pdf.text(heading, 16, 20); let y = 20 + heading.length * 6;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    for (const line of [companyName, customerName, project.address, `Photo ${index + 1}/${selected.length} · ${new Date(photo.createdAt).toLocaleDateString('fr-FR')}`, photo.caption].filter(Boolean)) {
      const wrapped = pdf.splitTextToSize(text(line), 178) as string[];
      pdf.text(wrapped, 16, y); y += wrapped.length * 4.5 + 2;
    }
    const response = await fetch(photo.dataUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Lecture de « ${photo.name} » impossible. Réessayez.`);
    const blob = await response.blob();
    const [source] = await readQuoteSourceFiles([new File([blob], photo.name || 'photo.jpg', { type: blob.type || 'image/jpeg' })]);
    const image = source.image!;
    const size = pdf.getImageProperties(image);
    const ratio = Math.min(178 / size.width, Math.max(20, 274 - y) / size.height);
    const width = size.width * ratio, height = size.height * ratio;
    pdf.addImage(image, 'JPEG', (210 - width) / 2, y, width, height);
    pdf.setFontSize(8); pdf.text(`MANUFEO · Dossier photos · ${index + 1}/${selected.length}`, 105, 289, { align: 'center' });
  }
  const blob = pdf.output('blob');
  if (blob.size > 3_000_000) throw new Error('Dossier trop volumineux. Sélectionnez moins de photos par envoi.');
  return blob;
}
