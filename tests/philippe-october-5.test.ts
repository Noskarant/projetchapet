import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMobileVoiceCommand, fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from '../lib/mobile-voice-command';
import { seedMobileWorkspace, calculateTotals, type LineItem } from '../lib/mobile-prototype';
import { normalizeModelPlan } from '../lib/action-planner';
import { groupedVoiceLineOrder, sharedVoiceUnitPrice } from '../lib/voice-document-lines';
import { polishFrenchTradeDesignation } from '../lib/quote-language-polish';
import { weatherCoordinates, readLocalWeather } from '../lib/local-weather';
import { GET as weatherRoute } from '../app/api/weather/route';

const lines: LineItem[] = [
  { id: 'bath-1', label: 'Salle de bain, piquage et purge', description: '', quantity: 1, unit: 'unité', unitPrice: 1700, taxRate: 10 },
  { id: 'kitchen-1', label: 'Cuisine, peinture des murs', description: '', quantity: 27, unit: 'm²', unitPrice: 27, taxRate: 10 },
  { id: 'bath-2', label: 'Salle de bains, enduissage des supports', description: '', quantity: 1, unit: 'unité', unitPrice: 100, taxRate: 20 },
  { id: 'misc', label: 'Protection du chantier', description: '', quantity: null, unit: null, unitPrice: null, taxRate: null },
  { id: 'kitchen-2', label: 'Cuisine, peinture des plafonds', description: '', quantity: 5, unit: 'm²', unitPrice: 31, taxRate: 5.5 },
];

test('classement vocal des pièces : devis et facture conservent chaque ligne et tous leurs montants', () => {
  for (const entity of ['quote', 'invoice'] as const) {
    const workspace = seedMobileWorkspace();
    const document = entity === 'quote' ? workspace.quotes[0] : workspace.invoices[0];
    document.items = structuredClone(lines); Object.assign(document, calculateTotals(lines));
    const before = structuredClone(document);
    const fallback = fallbackMobileVoiceCommand('Rassemble les postes de la salle de bain ensemble et ceux de la cuisine ensemble.', { entity, id: document.id, data: document }, workspace);
    // Even an omitted or incorrect model order must not undo deterministic grouping.
    const command = sanitizeMobileVoiceCommand({ line_order: ['unknown'], changes: { status: 'Payée' }, line_operations: [{ action: 'delete', match: 'Cuisine' }] }, fallback);
    const result = applyMobileVoiceCommand(workspace, command);
    const changed = (entity === 'quote' ? result.quotes : result.invoices).find(item => item.id === document.id)!;
    assert.deepEqual(changed.items.map(item => item.id), ['bath-1', 'bath-2', 'kitchen-1', 'misc', 'kitchen-2']);
    assert.deepEqual([...changed.items].sort((a, b) => a.id.localeCompare(b.id)), [...before.items].sort((a, b) => a.id.localeCompare(b.id)));
    assert.equal(changed.total, before.total);
    assert.deepEqual(document, before);
  }
});

test('un ordre incomplet, dupliqué ou inconnu ne perd ni ne duplique de prestation', () => {
  for (const order of [['bath-1'], ['bath-1', 'bath-1', 'bath-2', 'misc', 'kitchen-2'], ['bad', 'kitchen-1', 'bath-2', 'misc', 'kitchen-2']]) {
    const workspace = seedMobileWorkspace(); const quote = workspace.quotes[0]; quote.items = lines;
    const result = applyMobileVoiceCommand(workspace, { entity: 'quote', id: quote.id, summary: '', line_order: order });
    assert.deepEqual(result.quotes.find(item => item.id === quote.id)!.items, lines);
  }
  assert.equal(groupedVoiceLineOrder('Change le prix de la cuisine à 27 euros.', lines), undefined);
});

test('prix unitaire 1 700 HT et même prix sur les deux autres lignes : valeurs récupérées sans fusion', () => {
  const transcript = 'Piquage et purge, une unité à 1 700 euros HT. Enduissage des supports. Peinture de finition. Même prix pour les deux autres lignes. TVA 10 %.';
  const action = normalizeModelPlan({ actions: [{ intent_type: 'prepare_quote', payload: { customer_hint: 'Dupont', items: [
    { label: 'Piquage et purge', quantity: null, unit: null, unit_price: 700, price_evidence: 'une unité à 1 700 euros HT' },
    { label: 'Enduissage des supports', quantity: 1, unit: 'unité', unit_price: null },
    { label: 'Peinture de finition', quantity: 1, unit: 'unité', unit_price: null },
  ] } }] }, transcript)[0];
  const items = action.payload.items as Array<{ quantity: number; unit: string; unit_price: number }>;
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(item => item.unit_price), [1700, 1700, 1700]);
  assert.equal(items[0].quantity, 1); assert.equal(items[0].unit, 'unité');
  assert.equal(sharedVoiceUnitPrice('Une unité à 1700 euros HT.', 3), null);
  assert.equal(sharedVoiceUnitPrice('Même prix à 1700 euros HT pour les deux autres lignes.', 5), null);
  assert.equal(sharedVoiceUnitPrice('Même prix pour toutes les lignes, 1700 euros HT et 30 euros HT.', 3), null);
});

test('modifier le même prix HT de toutes les lignes utilise leurs identifiants et conserve leurs TVA et quantités', () => {
  const workspace = seedMobileWorkspace(); const quote = workspace.quotes[0]; quote.items = lines.slice(0, 3);
  const fallback = fallbackMobileVoiceCommand('Mets le même prix de 1 700 euros HT pour toutes les lignes.', { entity: 'quote', id: quote.id, data: quote }, workspace);
  const command = sanitizeMobileVoiceCommand({ line_operations: [] }, fallback);
  const result = applyMobileVoiceCommand(workspace, command).quotes.find(item => item.id === quote.id)!;
  assert.deepEqual(result.items.map(item => item.unitPrice), [1700, 1700, 1700]);
  assert.deepEqual(result.items.map(item => item.quantity), [1, 27, 1]);
  assert.deepEqual(result.items.map(item => item.taxRate), [10, 10, 20]);
});

test('orthographe métier et mises à jour nulles : pas de valeurs inventées', () => {
  assert.equal(polishFrenchTradeDesignation('piquage, purge, ratisage et enduisage des supports'), 'Piquage, purge, ratissage et enduissage des supports');
  const workspace = seedMobileWorkspace(); const quote = workspace.quotes[0]; quote.items = lines;
  const result = applyMobileVoiceCommand(workspace, { entity: 'quote', id: quote.id, summary: '', line_operations: [{ action: 'update', line_id: 'bath-1', prix_unitaire_ht: null as unknown as number }] });
  assert.equal(result.quotes.find(item => item.id === quote.id)!.items[0].unitPrice, 1700);
  const ambiguous = applyMobileVoiceCommand(workspace, { entity: 'quote', id: quote.id, summary: '', line_operations: [{ action: 'update', match: 'Cuisine', prix_unitaire_ht: 999 }] });
  assert.deepEqual(ambiguous.quotes.find(item => item.id === quote.id)!.items, lines);
});

test('météo : coordonnées arrondies, prévision proche de maintenant et réponse fournisseur invalide gérée', async () => {
  assert.deepEqual(weatherCoordinates('45.713456', '4.812345'), { lat: '45.71', lon: '4.81' });
  assert.equal(weatherCoordinates('', '0'), null); assert.equal(weatherCoordinates('91', '0'), null);
  const now = Date.now(), time = new Date(now).toISOString();
  const payload = { properties: { timeseries: [{ time, data: { instant: { details: { air_temperature: 12.6 } }, next_1_hours: { summary: { symbol_code: 'partlycloudy_day' } } } }] } };
  assert.deepEqual(readLocalWeather(payload, now), { temperature: 13, time, symbol: 'partlycloudy_day' });
  assert.equal(readLocalWeather(payload, now + 4 * 3600_000), null); assert.equal(readLocalWeather({}, now), null);
  const original = globalThis.fetch;
  try {
    let providerUrl = '';
    globalThis.fetch = async (url, init) => { providerUrl = String(url); assert.match((init?.headers as Record<string, string>)['User-Agent'], /MANUFEO/); return Response.json(payload); };
    const response = await weatherRoute(new Request('https://manufeo.test/api/weather?lat=45.713456&lon=4.812345'));
    assert.equal(response.status, 200); assert.match(providerUrl, /lat=45.71&lon=4.81/);
    assert.equal((await weatherRoute(new Request('https://manufeo.test/api/weather?lat=nan&lon=4'))).status, 400);
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    assert.equal((await weatherRoute(new Request('https://manufeo.test/api/weather?lat=45&lon=4'))).status, 503);
  } finally { globalThis.fetch = original; }
});
