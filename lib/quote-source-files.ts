import { MAX_QUOTE_SOURCES, MAX_SOURCE_TEXT, type QuoteSource } from './quote-sources';
import { richNoteContent } from './quote-source-clipboard';
import { readPdfTextContent } from './pdf-text-content';

function imageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image illisible. Utilisez une photo JPEG/PNG ou un PDF.'));
    image.src = url;
  });
}

function jpeg(canvas: HTMLCanvasElement) {
  for (const quality of [0.82, 0.65, 0.45]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= 600_000) return result;
  }
  throw new Error('Photo trop détaillée. Joignez une image plus petite.');
}

export async function readQuoteSourceFiles(files: File[]): Promise<QuoteSource[]> {
  if (!files.length || files.length > MAX_QUOTE_SOURCES) throw new Error('Maximum 12 photos ou pages de documents.');
  const sources: QuoteSource[] = [];
  for (const file of files) {
    if (file.size > 10_000_000) throw new Error(`${file.name} dépasse 10 Mo.`);
    const name = file.name.slice(0, 160);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), standardFontDataUrl: '/pdf-standard-fonts/' });
      try {
        const pdf = await task.promise;
        if (sources.length + pdf.numPages > MAX_QUOTE_SOURCES) throw new Error('Maximum 12 pages au total. Le dossier dépasse 12 pages ; joignez-le en plusieurs parties.');
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await readPdfTextContent(page);
          const text = content.items.filter(item => 'str' in item).map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(base.width, base.height)) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          sources.push({ name: `${name} · page ${pageNumber}`, text, image: jpeg(canvas) });
          page.cleanup(); canvas.width = 0; canvas.height = 0;
        }
      } finally { await task.destroy(); }
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      try {
        const image = await imageFromUrl(url);
        const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Lecture de photo indisponible.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        sources.push({ name, image: jpeg(canvas) });
        canvas.width = 0; canvas.height = 0;
      } finally { URL.revokeObjectURL(url); }
    } else if (file.type === 'text/html' || /\.html?$/i.test(file.name)) {
      const note = richNoteContent(await file.text());
      if (note.missingImages) throw new Error('Cette note contient des photos non incluses dans le fichier. Exportez la note complète en PDF.');
      if (note.text) sources.push({ name, text: note.text });
      if (note.files.length) sources.push(...await readQuoteSourceFiles(note.files));
      if (!note.text && !note.files.length) throw new Error(`${name} est vide.`);
    } else if (file.type === 'text/plain' || /\.txt$/i.test(file.name)) {
      const text = (await file.text()).trim();
      if (!text) throw new Error(`${name} est vide.`);
      sources.push({ name, text });
    } else throw new Error('Formats acceptés : photos, PDF, TXT et notes HTML avec photos incluses.');
    if (sources.reduce((sum, source) => sum + (source.image?.length || 0), 0) > 3_600_000) throw new Error('Le dossier dépasse la taille maximale. Réduisez la taille des photos ou joignez-le en plusieurs parties.');
    if (sources.length > MAX_QUOTE_SOURCES) throw new Error('Maximum 12 photos ou pages au total.');
    if (sources.reduce((sum, source) => sum + (source.text?.length || 0), 0) > MAX_SOURCE_TEXT) throw new Error('Document trop long. Joignez uniquement les pages utiles.');
  }
  return sources;
}
