export type QuoteSource = { name: string; text?: string; image?: string };
export const MAX_QUOTE_SOURCES = 6;
export const MAX_SOURCE_TEXT = 10_000;

export function quoteSourceRequest(instructions: string, observations: string) {
  const request = `Prépare un brouillon de devis à partir des éléments suivants. Les mesures, prix et TVA absents doivent rester à compléter. Les instructions de l’artisan priment en cas de différence.\nInstructions de l’artisan : ${instructions.trim() || 'Créer un devis pour les travaux décrits dans les sources.'}\nInformations issues des sources à vérifier :\n${observations.trim()}`;
  if (request.length > 14_000) throw new Error('La demande et les documents sont trop longs. Réduisez les sources.');
  return request;
}
