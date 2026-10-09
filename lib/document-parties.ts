import {spokenDiscount} from './percentage-adjustments';

/** Only the artisan's instructions can override the party named by a source. */
export function artisanInstructions(transcript: string) {
  const start = transcript.match(/(?:Instructions de l['’]artisan|Note copiée depuis Notes ou instructions de l['’]artisan)\s*:/iu);
  const text = start ? transcript.slice(start.index! + start[0].length) : transcript;
  return text.split(/Informations (?:issues des sources à vérifier|lues dans les fichiers)\s*:/iu)[0].trim();
}

const clean = (value: string) => value.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();

export function requestedBillTo(transcript: string) {
  const instructions = artisanInstructions(transcript).replace(/\bM\.\s+/gu, 'Monsieur ').replace(/\bMme\.\s+/gu, 'Madame ');
  const explicit = instructions.match(/\b(?:client(?:\s+facturé)?|donneur d['’]ordre|commanditaire)\s*[,;:]?\s*(?:c['’]est|est|sera|=|:)\s+([^,.;\n]+)/iu)
    || instructions.match(/\b(?:devis|facture)\s+(?:pour|au nom de|à l['’]attention de)\s+([^,.;\n]+)/iu);
  if (explicit && !/^(?:les? |des? |ces? |vos? )?(?:travaux|prestations|sources|documents|informations)\b/iu.test(clean(explicit[1]))) return clean(explicit[1].split(/\s+(?:pour (?:un|le) chantier|qui (?:est déjà|habite|demeure|réside)|déjà (?:dans|enregistré)|avec (?:l['’]adresse|une TVA)|suite\b)/iu)[0]);
  // Vision extraction distinguishes an agency's request from an insurance mission.
  const sources = (transcript.split(/Informations (?:issues des sources à vérifier|lues dans les fichiers)\s*:/iu)[1] || '').replace(/[*_]/g, '');
  const labelled = sources.match(/Client facturé\s*:\s*([^\n;]+)/iu);
  if (labelled) return clean(labelled[1].split(/\s+(?:Adresse(?: du client facturé)?|Téléphone(?: du client facturé)?|SIRET|SIREN|Occupant|Lieu d['’]intervention|Contact)\s*:/iu)[0]);
  return sourceInsuredName(transcript);
}

export function hasDistinctWorksite(transcript: string) {
  return /\b(?:occupant|occupé par|locataire|résident|lieu d['’]intervention|adresse (?:du chantier|du sinistre)|chantier chez|appartement (?:de|occupé))\b/iu.test(transcript);
}

export function worksiteDocumentNotes(notes: string, source: Record<string, unknown>, transcript: string) {
  const additions: string[] = [];
  const site = typeof source.site_address === 'string' ? source.site_address.trim() : '';
  const evidence = artisanInstructions(transcript);
  const address = site && transcript.toLowerCase().includes(site.toLowerCase()) ? site
    : evidence.match(/(?:adresse (?:du chantier|du sinistre)|lieu d['’]intervention)\s*(?:c['’]est|est|:)\s*([^.;]+)/iu)?.[1]?.trim()
    || evidence.match(/(?:appartement|chantier|intervention)\s+(?:situé\s+)?au\s+([^.;]+?)(?=,?\s*occupé\s+par|[.;]|$)/iu)?.[1]?.trim();
  const occupant = evidence.match(/(?:occupé par|occupant\s*(?:c['’]est|est|:)|(?:chantier|intervention)\s+chez)\s+((?:M\.?|Monsieur|Mme|Madame)\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+)?)(?=[,.;]|\s+(?:au|avec|son)\b|$)/iu)?.[1];
  if (address && !notes.includes(address)) additions.push(`Lieu d’intervention : ${address}.`);
  if (occupant && !notes.toLowerCase().includes(occupant.toLowerCase())) additions.push(`Occupant : ${occupant}.`);
  const phone = occupant ? evidence.match(/\b(?:son téléphone|téléphone (?:de l['’]occupant|du locataire))\s*:?\s*((?:\+33|0)[\d .-]{8,20})/iu)?.[1]?.trim() : '';
  if(phone && !notes.includes(phone)) additions.push(`Téléphone de l’occupant : ${phone}.`);
  return [notes, ...additions].filter(Boolean).join('\n').slice(0, 2400);
}

export function stripUngroundedDiscountNotes(notes: string, transcript: string) {
  // "Remise en état" describes work, never a financial reduction.
  const discountRequested = (spokenDiscount(transcript) ?? 0)>0;
  if (discountRequested) return notes;
  return notes.replace(/\bremise(?:\s+(?:accordée|commerciale|globale))?\s*(?:de|à|:)?\s*\d+(?:[,.]\d+)?\s*%\s*(?:et\s*)?/giu, '').replace(/ {2,}/g, ' ').trim();
}

/** A unique explicitly labelled insured; never the insurer or contractor. */
export function sourceInsuredName(transcript: string) {
  const sources = (transcript.split(/Informations (?:issues des sources à vérifier|lues dans les fichiers)\s*:/iu)[1] || '').replace(/[*_]/g, '');
  const insured = [...sources.matchAll(/(?:^|[\n;.])\s*(?:[-•]\s*)?(?:Coordonnées (?:de l['’])?assuré|Nom (?:de l['’])?assuré|Assuré(?:e)?)\s*:\s*([^\n;.]+)/giu)].map(match => clean(match[1].split(/\s+(?:Téléphone|Adresse|Email|E-mail|Numéro|Référence)\s*:/iu)[0]));
  const names = [...new Map(insured.filter(Boolean).map(name => [name.toLocaleLowerCase('fr-FR'), name])).values()];
  return names.length === 1 ? names[0] : '';
}
