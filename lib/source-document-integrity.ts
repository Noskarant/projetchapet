import { ApiInputError } from './api-guard';
import { documentUnit } from './document-units';
import { artisanInstructions } from './document-parties';

export const SOURCE_ROWS_START = 'Début des lignes documentaires contrôlées :';
export const SOURCE_ROWS_END = 'Fin des lignes documentaires contrôlées';
export type SourceRow = {
  id: string; location: string; label: string; description: string;
  quantity: number | null; unit: string | null; unit_price: number | null;
  line_total: number | null; line_total_type: 'ht' | 'ttc' | 'unknown'; price_type: 'ht' | 'ttc' | 'unknown';
  tax_rate: number | null; tax_code: string; uncertain_fields: string[];
};
export type SourceDocument = {
  id: string; name: string; kind: string; reference: string; observations: string;
  rows: SourceRow[]; rows_complete: boolean; subtotal: number | null; subtotal_scope: 'page' | 'document' | 'unknown';
};
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const key = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const financial = (d: SourceDocument) => ['estimate','pricing_note'].includes(d.kind);
const fields = ['quantity','unit_price','line_total','tax_rate','unit','price_type','line_total_type'] as const;
export function sourceNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 10_000_000 ? value : null;
  let token = text(value).replace(/(?:€|euros?|%)/giu, '').replace(/[\s\u00a0\u202f]/g, '');
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/u.test(token)) token = token.replace(/\./g, '');
  if (!/^-?\d+(?:[,.]\d+)?$/u.test(token)) return null;
  const parsed = Number(token.replace(',', '.'));
  return Number.isFinite(parsed) && Math.abs(parsed) <= 10_000_000 ? parsed : null;
}
export function sourceRowConsistent(row: SourceRow) {
  if (row.quantity === null || row.unit_price === null || row.line_total === null || row.price_type === 'unknown' || row.line_total_type !== row.price_type) return null;
  return Math.abs(Math.round(row.quantity * row.unit_price * 100) / 100 - row.line_total) <= 0.02;
}
/** Validate sizes and topology before retaining any OCR result. No silent truncation. */
export function parseSourceDocuments(raw: unknown, expected: Array<{id:string;name:string}>): SourceDocument[] {
  const list = obj(raw).sources;
  if (!Array.isArray(list) || list.length !== expected.length) throw new ApiInputError('La lecture n’a pas conservé toutes les pages. Réessayez avec une photo plus nette.', 422);
  return expected.map((source, index) => {
    const matches = list.filter(value => obj(value).source_index === index);
    if (matches.length !== 1) throw new ApiInputError('Les pages du dossier n’ont pas pu être distinguées. Réessayez.', 422);
    const d = obj(matches[0]);
    if (!['estimate','pricing_note','insurance','customer','context','other'].includes(text(d.kind)) || !Array.isArray(d.rows) || d.rows.length > 100 || typeof d.rows_complete !== 'boolean') throw new ApiInputError('Lecture du document incomplète. Réessayez avec une photo plus nette.', 422);
    const observations = text(d.observations);
    if (observations.length > 10_000) throw new ApiInputError('Ce document contient trop de texte. Joignez moins de pages.', 413);
    const rows = d.rows.map((rawRow, position): SourceRow => {
      const r = obj(rawRow);
      let label = text(r.label), description = text(r.description);
      const location = text(r.location);
      if (!label || label.length > 2000 || description.length > 2000 || location.length > 100) throw new ApiInputError('Une prestation est illisible ou trop longue pour être reprise sans perte. Joignez un extrait plus lisible.', 422);
      if (label.length > 120) { description = [label, description].filter(Boolean).join('\n'); label = label.slice(0, 100).replace(/\s+\S*$/, '') + '…'; }
      if (description.length > 2000) throw new ApiInputError('Une description dépasse la capacité du devis. Découpez cette prestation explicitement.', 422);
      const uncertainty = Array.isArray(r.uncertain_fields) ? r.uncertain_fields.filter(f => fields.includes(f as typeof fields[number])) as string[] : [];
      const quantity = sourceNumber(r.quantity), price = sourceNumber(r.unit_price), total = sourceNumber(r.line_total);
      for (const field of ['quantity','unit_price','line_total'] as const) if (r[field] !== null && r[field] !== undefined && sourceNumber(r[field]) === null) uncertainty.push(field);
      if (quantity !== null && quantity < 0) uncertainty.push('quantity');
      const type = ['ht','ttc'].includes(text(r.price_type)) ? text(r.price_type) : ['ht','ttc'].includes(text(d.unit_price_type)) ? text(d.unit_price_type) : ['ht','ttc'].includes(text(d.line_total_type)) ? text(d.line_total_type) : 'unknown';
      const rate = d.tax_column === 'code' ? null : sourceNumber(r.tax_rate);
      if (d.tax_column !== 'code' && r.tax_rate !== null && r.tax_rate !== undefined && rate === null || rate !== null && ![0,5.5,10,20].includes(rate)) uncertainty.push('tax_rate');
      return {id:`${source.id}-r${position}`,location,label,description,quantity,unit:documentUnit(text(r.unit).slice(0,40)),unit_price:price,line_total:total,line_total_type:['ht','ttc'].includes(text(d.line_total_type)) ? text(d.line_total_type) as 'ht'|'ttc' : 'unknown',price_type:type as SourceRow['price_type'],tax_rate:rate !== null && [0,5.5,10,20].includes(rate) ? rate : null,tax_code:text(r.tax_code).slice(0,40),uncertain_fields:[...new Set(uncertainty)]};
    });
    if (!['estimate','pricing_note'].includes(text(d.kind)) && rows.length) throw new ApiInputError('La lecture a transformé une photo de contexte en prestations. Réessayez avec le descriptif des travaux.', 422);
    if (d.rows_complete !== true && ['estimate','pricing_note'].includes(text(d.kind))) throw new ApiInputError('Toutes les prestations ne sont pas lisibles. Joignez une photo plus nette ou la page complète.', 422);
    return {id:source.id,name:source.name,kind:text(d.kind),reference:text(d.reference).slice(0,100),observations,rows,rows_complete:d.rows_complete,subtotal:sourceNumber(d.subtotal),subtotal_scope:['page','document'].includes(text(d.subtotal_scope)) ? text(d.subtotal_scope) as SourceDocument['subtotal_scope'] : 'unknown'};
  });
}
/** Compare an independent rereading. Agreement is a check, not a guarantee of OCR accuracy. */
export function reconcileSourceReadings(first: SourceDocument[], second: SourceDocument[]): SourceDocument[] {
  return first.map((doc, index) => {
    if (!financial(doc) || !doc.rows.length) return doc;
    const verified = second[index];
    if (!verified || !financial(verified) || !verified.rows_complete || verified.rows.length !== doc.rows.length) throw new ApiInputError('Les lectures ne retrouvent pas les mêmes prestations. Joignez une photo plus nette pour éviter un poste manquant ou doublé.', 422);
    const rows = doc.rows.map((row, position) => {
      const check = verified.rows[position];
      // Preserve the source order; matching labels alone confuses repeated room headings.
      const sameHeading = key(row.location) === key(check.location) && (row.description && check.description ? key(row.description) === key(check.description) : key(row.label) === key(check.label));
      if (!sameHeading) throw new ApiInputError('L’ordre ou la désignation des prestations reste incertain. Joignez une photo plus nette.', 422);
      const disagreements = fields.filter(field => row[field] !== check[field]);
      // Repair a bad reading only when the printed row total agrees and the reread
      // satisfies it. Never solve for a missing quantity or invent a unit price.
      const repaired = sourceRowConsistent(row) === false && sourceRowConsistent(check) === true && row.line_total === check.line_total && row.line_total_type === check.line_total_type && row.price_type === check.price_type;
      const result = {...(repaired ? check : row),id:row.id,uncertain_fields:[...new Set([...(repaired ? check.uncertain_fields : [...row.uncertain_fields,...check.uncertain_fields,...disagreements])])]};
      if (sourceRowConsistent(result) === false) result.uncertain_fields.push('quantity','unit_price');
      result.uncertain_fields = [...new Set(result.uncertain_fields)];
      return result;
    });
    const subtotal = doc.subtotal === verified.subtotal && doc.subtotal_scope === verified.subtotal_scope ? doc.subtotal : null;
    // Only a visible page subtotal covers all rows on one photo. A document total
    // on a continuation page must never be compared with that page alone.
    if (subtotal !== null && doc.subtotal_scope === 'page' && rows.every(row => row.line_total !== null)
      && Math.abs(rows.reduce((sum,row)=>sum+row.line_total!,0)-subtotal) > 0.02) throw new ApiInputError('Le sous-total lu ne correspond pas aux lignes de cette page. Joignez une photo plus nette.', 422);
    return {...doc,rows,subtotal};
  });
}
export function sourceDocumentObservations(documents: SourceDocument[]) {
  const text = documents.map(doc=>`Début document joint :\n${doc.name} :\n${doc.observations}\nFin document joint`).join('\n\n');
  const data = documents.map(({observations: _observations,...doc})=>doc);
  return `${text}\n${SOURCE_ROWS_START}\n${JSON.stringify({sources:data})}\n${SOURCE_ROWS_END}`;
}
export function sourceDocumentsFromTranscript(transcript: string): SourceDocument[] {
  const start = transcript.indexOf(SOURCE_ROWS_START), end = transcript.indexOf(SOURCE_ROWS_END,start);
  if (start < 0) return [];
  if (end < 0) throw new ApiInputError('Les données de lecture du document sont incomplètes. Réimportez les sources.',422);
  try {
    const raw = obj(JSON.parse(transcript.slice(start+SOURCE_ROWS_START.length,end).trim()));
    if (!Array.isArray(raw.sources) || !raw.sources.length || raw.sources.length > 12) throw new Error('sources');
    const docs = raw.sources as SourceDocument[];
    const ids = new Set<string>();
    for (const doc of docs) {
      if (!doc || !['estimate','pricing_note','insurance','customer','context','other'].includes(doc.kind)
        || typeof doc.id !== 'string' || !doc.id || ids.has(doc.id) || doc.id.length > 100
        || typeof doc.name !== 'string' || doc.name.length > 200 || typeof doc.reference !== 'string' || doc.reference.length > 100
        || typeof doc.rows_complete !== 'boolean' || !Array.isArray(doc.rows) || doc.rows.length > 100
        || !['page','document','unknown'].includes(doc.subtotal_scope)
        || doc.subtotal !== null && sourceNumber(doc.subtotal) !== doc.subtotal
        || doc.rows.length && (!financial(doc) || !doc.rows_complete)) throw new Error('document');
      ids.add(doc.id);
      const rowIds = new Set<string>();
      for (const row of doc.rows) {
        if (!row || typeof row.id !== 'string' || !row.id || rowIds.has(row.id) || row.id.length > 120
          || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120
          || typeof row.description !== 'string' || row.description.length > 2000
          || typeof row.location !== 'string' || row.location.length > 100
          || typeof row.tax_code !== 'string' || row.tax_code.length > 40
          || !['ht','ttc','unknown'].includes(row.price_type) || !['ht','ttc','unknown'].includes(row.line_total_type)
          || !Array.isArray(row.uncertain_fields) || row.uncertain_fields.some(f=>!fields.includes(f as typeof fields[number]))
          || row.unit !== null && (typeof row.unit !== 'string' || row.unit.length > 40)
          || ['quantity','unit_price','line_total','tax_rate'].some(f=>{
            const value = row[f as keyof SourceRow]; return value !== null && (typeof value !== 'number' || sourceNumber(value) !== value);
          }) || row.tax_rate !== null && ![0,5.5,10,20].includes(row.tax_rate)) throw new Error('row');
        rowIds.add(row.id);
      }
    }
    return docs;
  } catch { throw new ApiInputError('Les données de lecture du document sont incomplètes. Réimportez les sources.',422); }
}

export function canonicalSourceRows(transcript: string): SourceRow[] | null {
  const docs = sourceDocumentsFromTranscript(transcript);
  if (!docs.length) return null;
  // A copied artisan pricing note defines the scope over an administrative estimate.
  const note = transcript.split('Début document joint :')[0].match(/Début de la note artisan\s*:\s*([\s\S]*?)\nFin de la note artisan/iu)?.[1] || '';
  const instructions = artisanInstructions(transcript);
  if (/\d+(?:[,.]\d+)?\s*(?:m[²2]|rouleaux?|rx|unités?|forfaits?)\s*(?:à|a|@)/iu.test(note)) return null;
  const priced = docs.filter(financial).filter(doc=>doc.rows.length);
  if (!priced.length) {
    if (!docs.some(doc=>doc.kind==='insurance') && !note.trim() && /^(?:Préparer le devis à partir des sources jointes\.?|)$/iu.test(instructions.trim())) throw new ApiInputError('Cette photo fournit du contexte, sans prestation demandée. Ajoutez le descriptif des travaux à chiffrer.',422);
    return null;
  }
  const artisan = priced.filter(doc=>doc.kind==='pricing_note');
  const chosen = artisan.length ? artisan : priced;
  const references = [...new Set(chosen.map(doc=>doc.reference).filter(Boolean))];
  if (references.length > 1) throw new ApiInputError('Plusieurs devis distincts sont présents. Choisissez le document à reprendre pour éviter d’additionner des alternatives.',422);
  // Never silently accumulate two copies of the same priced page.
  const fingerprints = new Set<string>();
  for (const doc of chosen) {
    const fingerprint = JSON.stringify(doc.rows.map(({id:_id,...row})=>row));
    if (fingerprints.has(fingerprint)) throw new ApiInputError('Une même page de prestations semble jointe plusieurs fois. Retirez le doublon avant de reprendre le devis.',422);
    fingerprints.add(fingerprint);
  }
  const rows = chosen.flatMap(doc=>doc.rows);
  if (rows.length > 100) throw new ApiInputError('Ce dossier dépasse 100 prestations. Importez les documents séparément.',413);
  return rows;
}
