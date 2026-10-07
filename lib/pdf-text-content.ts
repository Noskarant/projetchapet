import type { PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api';

// Safari supports stream readers before it supports async stream iteration.
export async function readPdfTextContent(page: Pick<PDFPageProxy, 'streamTextContent'>): Promise<TextContent> {
  const reader = page.streamTextContent().getReader();
  const content: TextContent = { items: [], styles: Object.create(null), lang: null };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      content.lang ??= value.lang;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }
    return content;
  } finally { reader.releaseLock(); }
}
