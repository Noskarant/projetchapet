import {artisanInstructions} from './document-parties';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A copied estimate defines scope; mission/photographic context does not add charges. */
export function sourceWorkItems(items: unknown[], transcript: string) {
  const note = [...transcript.matchAll(/Début de la note artisan\s*:\s*([\s\S]*?)\nFin de la note artisan/giu)].map(match => match[1]).join('\n');
  if (!note || !/\d+(?:[,.]\d+)?\s*(?:m[²2]|rouleaux?|rx|unités?|forfaits?)\s*(?:à|a|@)/iu.test(note)) return items;
  // An explicit request to extend the scope takes precedence over a copied estimate.
  if (/\b(?:ajoute|complète|inclus|inclure|rajoute|ajouter)\b/iu.test(artisanInstructions(transcript))) return items;
  const scope = normalize(note);
  return items.filter(raw => {
    if (!raw || typeof raw !== 'object') return true;
    const item = raw as Record<string, unknown>;
    const evidence = typeof item.scope_evidence === 'string' ? normalize(item.scope_evidence) : '';
    // Only reject a grounded contextual excerpt, never a missing model annotation.
    if (!evidence || scope.includes(evidence)) return true;
    return !normalize(transcript.split('Informations issues des sources à vérifier')[1] || '').includes(evidence);
  });
}
