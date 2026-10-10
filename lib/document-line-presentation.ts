import { publicLineDescription } from './document-intervention-notes';

const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const roomStart = /^(?:(?:petite|grande|principale|ancienne|nouvelle)\s+)?(?:chambre|cuisine|salle\s+(?:de\s+bains?|d\s+eau|a\s+manger)|salon|sejour|couloir|entree|bureau|garage|terrasse|placard|cellier|buanderie|wc|toilettes|piece)\b/u;
const workWords = /\b(?:peinture|peint|papier|plafond|murs?|sols?|preparation|remplacement|reparation|pose|depose|fourniture|carrelage|poncage|enduit|ratissage|nettoyage|protection|electricite|plomberie|travaux)\b/u;

function isLocation(value: string) {
  const normalized = key(value);
  if (value.length > 100 || !roomStart.test(normalized) || workWords.test(normalized)) return false;
  // A line covering several rooms keeps its original designation.
  const remainder = normalized.replace(roomStart, '').trim();
  return !/\b(?:chambre|cuisine|salle|salon|sejour|couloir|bureau|garage|terrasse|placard|piece)\b/u.test(remainder);
}

function locatedText(value: string) {
  let located: { location: string; service: string } | null = null;
  for (const separator of value.matchAll(/\s+[-–—]\s+|\s*[:,]\s*|\n+/gu)) {
    const location = value.slice(0, separator.index).trim();
    const service = value.slice(separator.index + separator[0].length).trim();
    if (service && isLocation(location)) located = { location, service };
  }
  return located || (isLocation(value) ? { location: value, service: '' } : null);
}

function covers(service: string, description: string) {
  if (/\b(?:sans|non|sauf|hors|exclu\w*)\b/u.test(key(description))) return false;
  const words = key(service).split(' ').filter(word => /\d/u.test(word) || word.length > 2 && !['des', 'les', 'une', 'dans', 'sur', 'avec', 'pour', 'par', 'aux'].includes(word));
  const descriptionWords = new Set(key(description).split(' '));
  return words.length > 0 && words.every(word => descriptionWords.has(word));
}

/** Display only: never rewrite saved lines, their pricing keys or their order. */
export function documentLinePresentation(line: { label?: string | null; description?: string | null }, fallback = 'Prestation') {
  const label = line.label?.trim() || fallback;
  const description = publicLineDescription(line.description || '');
  if (/^(?:rse|franchise|remise|ouverture de chantier|protection de chantier)\b/u.test(key(label))) {
    return { title: label, description: key(description) === key(label) ? '' : description };
  }
  const fromLabel = locatedText(label);
  const fromDescription = locatedText(description);
  // Do not resolve contradictory room names or infer a room from the document.
  if (fromLabel && fromDescription && key(fromLabel.location) !== key(fromDescription.location)) return { title: label, description };
  const located = fromLabel || fromDescription;
  if (!located) return { title: label, description: key(description) === key(label) ? '' : description };

  const service = fromLabel ? fromLabel.service : label;
  const detail = fromDescription ? fromDescription.service : description;
  const content = !service || covers(service, detail) ? detail : [service, detail].filter(Boolean).join('\n');
  return { title: located.location, description: content.charAt(0).toLocaleUpperCase('fr-FR') + content.slice(1) };
}
