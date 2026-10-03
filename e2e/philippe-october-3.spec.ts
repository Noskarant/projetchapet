import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { normalizeModelPlan } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';
import { fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from '../lib/mobile-voice-command';
import type { MobileWorkspace } from '../lib/mobile-prototype';

const root = path.resolve(__dirname, '..');
const build = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Shell from './app/mobile-workspace-live-shell';
import Sync from './app/mobile-desktop-sync-bridge';
import Edit from './app/mobile-voice-edit-assistant';
import Assistant from './app/action-voice-assistant';
import Preview from './app/mobile-auto-pdf-preview';
import Unified from './app/mobile-unified-quote-sheet';
import Actions from './app/mobile-philippe-quote-actions-menu';
import Guard from './app/mobile-legacy-quote-detail-guard';
import './app/rappidos-mobile-shell.css'; import './app/mobile-quote-preview.css';
createRoot(document.getElementById('root')).render(<><Shell/><Sync/><Edit/><Assistant/><Preview/><Unified/><Actions/><Guard/></>);
` }, bundle: true, write: false, outdir: '/tmp/philippe-oct3-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${build.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const org = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const quoteId = '33333333-3333-4333-8333-333333333333';
const invoiceId = '55555555-5555-4555-8555-555555555555';
const storageKey = 'projetchapet-mobile-workspace-v3';
const metaKey = 'projetchapet-mobile-quote-meta-v1';

async function fixture(page: Page, failedSave = false, staleTax = false) {
  const customer = { id: customerId, organization_id: org, kind: 'individual', first_name: 'Henri', last_name: 'Perbet', civility: 'M.', company_name: null, emails: [], phones: [], addresses: [{ line1: '54 avenue de Montesquieu', city: 'Vosges', postal_code: '' }], created_at: '2026-10-03', updated_at: '2026-10-03' };
  const item = { position: 0, label: 'Portail extérieur : préparation, peinture et antirouille', description: '', quantity: 1, unit: 'unité', unit_price: 1700, tax_rate: 10, total: 1700 };
  const quote = { id: quoteId, organization_id: org, customer_id: customerId, customer, number: 'DEV-2026-099', title: 'Portail extérieur', status: 'draft', issue_date: '2026-10-03', expiry_date: '2026-11-03', subtotal: 1700, tax_total: 170, total: 1870, notes: 'Remise globale de 2 % sur ce chantier. Franchise de 150 euros TTC.', items: [item] };
  const invoice = { ...quote, id: invoiceId, number: 'FAC-2026-099', due_date: '2026-11-03', notes: '', paid_total: 0, quote_id: null };
  const mobileCustomer = { id: customerId, kind: 'Particulier' as const, companyName: '', firstName: 'Henri', lastName: 'Perbet', civility: 'M.', address: '54 avenue de Montesquieu', postalCode: '', city: 'Vosges', siret: '', vat: '', emails: [], phones: [], notes: '' };
  const mobileDocument = { id: quoteId, number: quote.number, title: quote.title, customerId, customerName: 'M. Perbet Henri', issueDate: quote.issue_date, expiryDate: quote.expiry_date, status: 'En attente' as const, items: [{ id: 'line-1', label: item.label, description: '', quantity: 1, unit: 'unité', unitPrice: 1700, taxRate: 10 }], notes: quote.notes, subtotal: 1700, taxTotal: 170, total: 1870 };
  const workspace: MobileWorkspace = { customers: [mobileCustomer], quotes: [mobileDocument], invoices: [{ ...mobileDocument, id: invoiceId, number: invoice.number, status: 'Brouillon', dueDate: invoice.due_date, paidTotal: 0, accountantSent: false, notes: '' }], agenda: [] };
  if (staleTax) { workspace.quotes[0].items[0].taxRate = null; workspace.quotes[0].taxTotal = 0; workspace.quotes[0].total = 1700; }
  const state = { discount: 2, saved: false, failures: failedSave ? 1 : 0, payments: 0, executions: 0, actions: [] as Array<Record<string, unknown>>, quote, invoice };
  await page.addInitScript(({ workspace, storageKey, metaKey }) => {
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
      localStorage.setItem(metaKey, JSON.stringify({ 'DEV-2026-099': { discountPercent: 2, internalNotes: 'Note privée conservée' } }));
    }
    localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '44444444-4444-4444-8444-444444444444' } }));
  }, { workspace, storageKey, metaKey });
  await page.route('https://backend.manufeo.test/**', async route => {
    const request = route.request(); const url = request.url();
    if (url.includes('ensure_personal_organization')) return route.fulfill({ json: org });
    if (url.includes('save_quote_document')) {
      // Longer than the former 650ms reload: success must await the server.
      await new Promise(resolve => setTimeout(resolve, 1800));
      if (state.failures-- > 0) return route.fulfill({ status: 503, json: { message: 'Sauvegarde momentanément indisponible.' } });
      const body = request.postDataJSON();
      state.quote.notes = body.p_notes; state.quote.items = body.p_items; state.saved = true;
      state.quote.subtotal = state.quote.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      state.quote.tax_total = state.quote.items.reduce((sum, item) => sum + item.quantity * item.unit_price * item.tax_rate / 100, 0);
      state.quote.total = state.quote.subtotal + state.quote.tax_total;
      return route.fulfill({ json: quoteId });
    }
    if (url.includes('record_invoice_payment')) { state.payments++; state.invoice.status = 'paid'; state.invoice.paid_total = state.invoice.total; return route.fulfill({ json: null }); }
    if (url.includes('/rest/v1/quote_private_meta')) {
      if (request.method() === 'POST') { state.discount = request.postDataJSON().discount_percent; return route.fulfill({ json: null }); }
      return route.fulfill({ json: [{ quote_number: quote.number, discount_percent: state.discount, internal_notes: 'Note privée conservée' }] });
    }
    if (url.includes('/rest/v1/customers')) return route.fulfill({ json: [customer] });
    if (url.includes('/rest/v1/quotes')) return route.fulfill({ json: [state.quote] });
    if (url.includes('/rest/v1/invoices')) {
      if (request.method() === 'PATCH') { state.invoice.status = request.postDataJSON().status; return route.fulfill({ json: { id: invoiceId } }); }
      return route.fulfill({ json: [state.invoice] });
    }
    if (url.includes('/rest/v1/action_proposals')) return route.fulfill({ json: state.actions });
    return route.fulfill({ json: [] });
  });
  const [agenda] = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: 'schedule_task', missing_fields: ['heure'], payload: { title: 'Chantier Monsieur Bazin', customer_hint: 'Monsieur Bazin', date: '2026-10-05', time: '' } }] }, 'Je me rappelle le 5 octobre où il faudra aller faire le chantier de Monsieur Bazin.'));
  await page.route('https://voice.manufeo.test/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/api/ai/status')) return route.fulfill({ json: { groq: true } });
    if (url.endsWith('/api/ai/command')) {
      const body = route.request().postDataJSON();
      const fallback = fallbackMobileVoiceCommand(body.transcript, body.target, body.workspace);
      return route.fulfill({ json: { data: sanitizeMobileVoiceCommand({ changes: fallback.changes, line_operations: /remise/iu.test(body.transcript) ? [{ action: 'delete', match: 'la remise de 2 %' }] : fallback.line_operations }, fallback) } });
    }
    if (url.endsWith('/api/actions/plan')) return route.fulfill({ json: { proposals: [{ id: 'bazin-proposal', organization_id: org, intent_type: agenda.intentType, payload: agenda.payload, status: agenda.status, missing_fields: agenda.missingFields, warnings: [], risk_level: agenda.riskLevel }] } });
    if (url.endsWith('/api/actions/execute')) {
      state.executions++;
      state.actions = [{ id: 'bazin-proposal', payload: agenda.payload, created_at: '2026-10-03T14:00:00Z' }];
      return route.fulfill({ json: { results: [{ proposalId: 'bazin-proposal', intentType: 'schedule_task', entityType: 'agenda_event', entityId: 'bazin-proposal', message: 'Rendez-vous enregistré.' }] } });
    }
    if (url.endsWith('/pdf.worker.min.mjs')) return route.fulfill({ response: await route.fetch({ url: 'http://127.0.0.1:3000/pdf.worker.min.mjs' }) });
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://voice.manufeo.test/');
  return state;
}

for (const failure of [false, true]) test(`remise vocale : sauvegarde ${failure ? 'en panne puis reprise' : 'lente'}, aucun succès avant persistance et zéro après rechargement`, async ({ page }) => {
  const state = await fixture(page, failure);
  await page.locator('.rm-document-card', { hasText: 'DEV-2026-099' }).click();
  const sheet = page.getByRole('dialog', { name: 'Fiche du devis' });
  await sheet.getByRole('button', { name: 'Actions du devis' }).click();
  await page.getByRole('dialog', { name: 'Actions du devis' }).getByRole('button', { name: 'Modifier à la voix' }).click();
  const editor = page.getByRole('dialog', { name: 'Modifier à la voix' });
  await editor.locator('textarea').fill('Enlève la remise de 2 %');
  await editor.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(editor).toContainText('Remise globale (%) : 0');
  await editor.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(editor).toContainText('Enregistrement de la modification');
  await page.waitForTimeout(750);
  expect(state.saved).toBe(false);
  await expect(editor).toBeVisible();
  if (failure) {
    await expect(editor.getByRole('button', { name: 'Appliquer', exact: true })).toBeVisible();
    await expect(editor).toContainText('Sauvegarde impossible');
    await editor.getByRole('button', { name: 'Appliquer', exact: true }).click();
  }
  await expect.poll(() => state.saved).toBe(true);
  await expect(editor).toHaveCount(0);
  expect(state.discount).toBe(0);
  expect(state.quote.notes).not.toMatch(/Remise/iu);
  await page.locator('.rm-document-card', { hasText: 'DEV-2026-099' }).click();
  await expect(sheet).toContainText('1 870,00');
  await expect(sheet).not.toContainText('-2 %');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}')['DEV-2026-099'], metaKey)).toEqual({ discountPercent: 0, internalNotes: 'Note privée conservée' });
});

test('Bazin : le rendez-vous sans heure apparaît immédiatement puis après rechargement', async ({ page }) => {
  const state = await fixture(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } })));
  await page.getByRole('textbox', { name: 'Demande à MANUFEO' }).fill('Je me rappelle le 5 octobre où il faudra aller faire le chantier de Monsieur Bazin.');
  await page.getByRole('button', { name: 'Créer avec MANUFEO' }).click();
  await expect(page.getByRole('button', { name: /Toute la journée.*Chantier Monsieur Bazin/ })).toBeVisible();
  expect(state.executions).toBe(1);
  await expect(page.getByRole('button', { name: 'Valider et exécuter' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: /^Tous / }).click();
  await expect(page.getByRole('button', { name: /Toute la journée.*Chantier Monsieur Bazin/ })).toBeVisible();
});

test('prix vocal sur un ancien téléphone : garde la TVA corrigée au bureau et les bons totaux après rechargement', async ({ page }) => {
  const state = await fixture(page, false, true);
  await page.locator('.rm-document-card', { hasText: 'DEV-2026-099' }).click();
  const sheet = page.getByRole('dialog', { name: 'Fiche du devis' });
  await sheet.getByRole('button', { name: 'Actions du devis' }).click();
  await page.getByRole('dialog', { name: 'Actions du devis' }).getByRole('button', { name: 'Modifier à la voix' }).click();
  const editor = page.getByRole('dialog', { name: 'Modifier à la voix' });
  await editor.locator('textarea').fill('Sur la ligne Portail extérieur, passe le prix à 1 800 euros');
  await editor.getByRole('button', { name: 'Analyser', exact: true }).click();
  await editor.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect.poll(() => state.saved).toBe(true);
  expect(state.quote.items[0].unit_price).toBe(1800);
  expect(state.quote.items[0].tax_rate).toBe(10);
  await expect(editor).toHaveCount(0);
  await page.locator('.rm-document-card', { hasText: 'DEV-2026-099' }).click();
  await expect(sheet).toContainText('1 940,40'); // Original 2% discount remains.
});

test('facture : statut modifiable et persistant, paiements conservés sans les compter deux fois', async ({ page }) => {
  const state = await fixture(page);
  const open = async () => {
    await page.getByRole('button', { name: 'Factures', exact: true }).click();
    await page.locator('.rm-document-card', { hasText: 'FAC-2026-099' }).click();
  };
  await open();
  const select = page.getByRole('combobox', { name: 'Statut de la facture', exact: true });
  await select.selectOption('En cours');
  await expect.poll(() => state.invoice.status).toBe('issued');
  await page.reload(); await open();
  await expect(select).toHaveValue('En cours');
  await expect(select.locator('option', { hasText: 'Brouillon' })).toHaveCount(0);
  await select.selectOption('Payée');
  await expect.poll(() => state.invoice.status).toBe('paid');
  await expect(select).toHaveValue('Payée');
  await select.selectOption('En retard');
  await expect.poll(() => state.invoice.status).toBe('overdue');
  await expect(select).toHaveValue('En retard');
  await select.selectOption('Payée');
  await expect.poll(() => state.invoice.status).toBe('paid');
  await page.reload(); await open();
  await expect(select).toHaveValue('Payée');
  expect(state.payments).toBe(1);
  expect(state.invoice.paid_total).toBe(1870);
});
