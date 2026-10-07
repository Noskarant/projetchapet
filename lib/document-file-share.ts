/** Share a prepared PDF synchronously from a click, preserving Safari's user activation. */
export async function sharePreparedPdf(blob: Blob, filename: string): Promise<void> {
  const safeName = filename.replace(/[\\/\u0000-\u001f]/g, '-');
  const file = new File([blob], safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`, { type: 'application/pdf' });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      // No PDF generation, upload or other await before opening the native share sheet.
      await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/i, '') });
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    window.alert('Le partage du PDF n’a pas pu s’ouvrir. Réessayez ou utilisez « Télécharger le PDF ».');
  }
}
