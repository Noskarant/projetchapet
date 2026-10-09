/** Read a rich note without executing HTML or fetching private/remote attachments. */
export function richNoteContent(html: string, plainText = '', nativeFiles: File[] = []) {
  if (!html) return {text: plainText, files: nativeFiles, missingImages: 0};
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,iframe,object,template').forEach(node => node.remove());
  const files = [...nativeFiles];
  let missingImages = 0;
  let nativeImageCount = nativeFiles.filter(file => file.type.startsWith('image/')).length;
  for (const [index, image] of Array.from(document.querySelectorAll('img')).entries()) {
    const src = image.getAttribute('src') || '';
    const embedded = src.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u);
    if (!embedded) { missingImages++; continue; }
    // Safari can expose the same embedded image as a native clipboard file.
    if (nativeImageCount > 0) { nativeImageCount--; continue; }
    if (embedded[2].length > 14_000_000) throw new Error('Une photo de la note dépasse 10 Mo. Exportez la note en PDF.');
    const bytes = Uint8Array.from(atob(embedded[2]), character => character.charCodeAt(0));
    files.push(new File([bytes], `photo-note-${index + 1}.${embedded[1].split('/')[1]}`, {type: embedded[1]}));
  }
  document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  document.querySelectorAll('p,div,li,tr,h1,h2,h3').forEach(node => node.append('\n'));
  return {text: plainText || (document.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim(), files, missingImages};
}

export function insertCopiedText(current: string, text: string, start: number, end: number) {
  const next = current.slice(0, start) + text + current.slice(end);
  if (next.length > 10_000) throw new Error('Texte trop long (10 000 caractères maximum).');
  return next;
}

export async function readClipboardNote(clipboard: Pick<Clipboard, 'read' | 'readText'>) {
  if (clipboard.read) {
    let items: ClipboardItem[];
    try { items = await clipboard.read(); }
    catch { return richNoteContent('', await clipboard.readText()); }
    let text = '', html = '';
    const files: File[] = [];
    for (const item of items) {
      if (item.types.includes('text/plain')) text += await (await item.getType('text/plain')).text();
      if (item.types.includes('text/html')) html += await (await item.getType('text/html')).text();
      const imageType = item.types.find(type => /^image\/(?:png|jpeg|webp)$/u.test(type));
      if (imageType) files.push(new File([await item.getType(imageType)], `photo-collée-${files.length + 1}.${imageType.split('/')[1]}`, {type: imageType}));
    }
    return richNoteContent(html, text, files);
  }
  return richNoteContent('', await clipboard.readText());
}
