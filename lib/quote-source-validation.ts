import { ApiInputError } from './api-guard';
import { MAX_QUOTE_SOURCES, MAX_SOURCE_TEXT, type QuoteSource } from './quote-sources';

export function validateQuoteSources(value: unknown): QuoteSource[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_QUOTE_SOURCES) {
    throw new ApiInputError('Joignez de 1 à 6 photos ou pages de documents.');
  }
  let textLength = 0;
  let imageLength = 0;
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiInputError('Source invalide.');
    const source = raw as Record<string, unknown>;
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200) throw new ApiInputError('Nom de fichier invalide.');
    const text = typeof source.text === 'string' ? source.text.trim() : '';
    const image = typeof source.image === 'string' ? source.image : '';
    if (!text && !image) throw new ApiInputError('Ce document est vide ou illisible.');
    textLength += text.length;
    imageLength += image.length;
    // Only inline images: the provider must never fetch a user supplied URL.
    if (image && (!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image) || image.length > 600_000)) {
      throw new ApiInputError('Photo invalide ou trop volumineuse.');
    }
    if (textLength > MAX_SOURCE_TEXT || imageLength > 3_600_000) throw new ApiInputError('Documents trop volumineux. Joignez un extrait plus court.', 413);
    return { name: source.name.trim(), ...(text ? { text } : {}), ...(image ? { image } : {}) };
  });
}
