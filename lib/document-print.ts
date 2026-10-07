// Print a separate A4 surface: preview zoom, dialogs and app chrome must never
// affect the physical document. Canvas copies preserve every rendered PDF page.
export function preparePdfPrint() {
  const viewers = Array.from(document.querySelectorAll<HTMLElement>('.manufeo-pdf-viewer'))
    .filter(viewer => viewer.getClientRects().length && viewer.dataset.pdfReady === 'true');
  const viewer = viewers.at(-1);
  if (!viewer) return false;
  document.getElementById('manufeo-print-document')?.remove();
  const root = document.createElement('div');
  root.id = 'manufeo-print-document';
  for (const source of viewer.querySelectorAll<HTMLCanvasElement>('.manufeo-pdf-pages canvas')) {
    const page = document.createElement('div');
    page.className = 'manufeo-print-page';
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(source, 0, 0);
    page.append(canvas); root.append(page);
  }
  if (!root.childElementCount) return false;
  document.body.append(root);
  document.body.classList.add('manufeo-printing-pdf');
  return true;
}

export function clearPdfPrint() {
  document.body.classList.remove('manufeo-printing-pdf');
  document.getElementById('manufeo-print-document')?.remove();
}

export async function printPdfPages() {
  const deadline = Date.now() + 15_000;
  while (!preparePdfPrint()) {
    if (Date.now() >= deadline) {
      window.alert('Le PDF n’est pas prêt. Attendez son affichage complet puis réessayez.');
      return;
    }
    await new Promise(resolve => window.setTimeout(resolve, 100));
  }
  window.print();
}
