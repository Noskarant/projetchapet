import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { normalizeModelPlan } from '../lib/action-planner';
import { hardenPlannedActions } from '../lib/action-plan-safety';

const root = path.resolve(__dirname, '..');
const build = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Assistant from './app/action-voice-assistant';
import Shell from './app/mobile-workspace-live-shell';
import Preview from './app/mobile-auto-pdf-preview';
import Unified from './app/mobile-unified-quote-sheet';
import LegacyGuard from './app/mobile-legacy-quote-detail-guard';
import './app/rappidos-mobile-shell.css';
createRoot(document.getElementById('root')).render(<><Shell/><Assistant/><Preview/><Unified/><LegacyGuard/></>);
` }, bundle: true, write: false, outdir: '/tmp/voice-quality-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') });
const org = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const entityId = '33333333-3333-4333-8333-333333333333';

for (const kind of ['quote', 'invoice', 'customer'] as const) {
  test(`production : dictée → ${kind} enregistré et ouvert sans validation, puis modification`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const transcript = 'TVA 10 %, crée un devis pour Crous de Lyon : peinture plafond, 12 mètres carrés à 22,40 euros HT. Papier peint à compléter.';
    const intent = kind === 'quote' ? 'prepare_quote' : kind === 'invoice' ? 'prepare_invoice' : 'create_customer';
    const normalized = hardenPlannedActions(normalizeModelPlan({ actions: [{ intent_type: intent,
      // Missing secondary fields and a genuinely unpriced service must not block.
      missing_fields: ['siret', 'telephone', 'items[1].unit_price'],
      payload: kind === 'customer' ? { kind: 'business', company_name: 'Crous de Lyon' } : { customer_id: customerId, customer_hint: 'Crous de Lyon', title: 'Cuisine CROUS', items: [
        { label: 'Peinture plafond', quantity: 12, quantity_evidence: '12 mètres carrés', unit: 'm²', unit_price: 22.4, price_evidence: '22,40 euros HT', tax_rate: 10, tax_evidence: 'TVA 10 %' },
        { label: 'Papier peint', quantity: null, unit: 'm²', unit_price: null, tax_rate: 10 },
      ] } }] }, transcript))[0];
    const proposal = { id: 'proposal-1', organization_id: org, intent_type: intent, payload: normalized.payload, status: normalized.status, missing_fields: normalized.missingFields, warnings: normalized.warnings, risk_level: normalized.riskLevel };
    const customer = { id: customerId, organization_id: org, kind: 'business', company_name: 'Crous de Lyon', emails: [], phones: [], addresses: [], created_at: '2026-10-03', updated_at: '2026-10-03' };
    const document = { id: entityId, organization_id: org, customer_id: customerId, customer, number: kind === 'invoice' ? 'FAC-2026-099' : 'DEV-2026-099', title: 'Cuisine CROUS', status: 'draft', issue_date: '2026-10-03', expiry_date: '2026-11-03', due_date: '2026-11-03', subtotal: 268.8, tax_total: 26.88, total: 295.68, paid_total: 0, notes: '', items: normalized.payload.items };
    let planningCalls = 0, executionCalls = 0;
    await page.route('https://backend.manufeo.test/**', async route => {
      const url = route.request().url();
      if (url.includes('ensure_personal_organization')) return route.fulfill({ json: org });
      if (url.includes('/rest/v1/customers')) return route.fulfill({ json: [customer] });
      if (url.includes('/rest/v1/quotes')) return route.fulfill({ json: kind === 'quote' ? [document] : [] });
      if (url.includes('/rest/v1/invoices')) return route.fulfill({ json: kind === 'invoice' ? [document] : [] });
      return route.fulfill({ json: [] });
    });
    await page.route('https://voice.manufeo.test/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/api/ai/status')) return route.fulfill({ json: { groq: true } });
      if (url.endsWith('/api/transcribe')) return route.fulfill({ json: { text: transcript, lowConfidenceSegments: 1, needsReview: true } });
      if (url.endsWith('/api/actions/plan')) { planningCalls++; return route.fulfill({ json: { proposals: [proposal] } }); }
      if (url.endsWith('/api/actions/execute')) {
        executionCalls++;
        expect(route.request().postDataJSON()).toMatchObject({ proposalIds: ['proposal-1'], directCreation: true, explicitConfirmation: false });
        return route.fulfill({ json: { requiresExplicit: kind === 'invoice', results: [{ proposalId: 'proposal-1', intentType: intent, entityType: kind, entityId: kind === 'customer' ? customerId : entityId, message: 'Création terminée.' }] } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' });
    });
    await page.goto('https://voice.manufeo.test/');
    await page.evaluate(() => {
      localStorage.setItem('projetchapet-mobile-workspace-v3', JSON.stringify({ customers: [], quotes: [], invoices: [], agenda: [] }));
      localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '44444444-4444-4444-8444-444444444444' } }));
      const node = () => ({ connect() {}, disconnect() {} });
      class FakeAudioContext {
        sampleRate = 8000; state = 'running'; destination = node();
        async resume() {} async close() {}
        createMediaStreamSource() { return node(); }
        createGain() { return { ...node(), gain: { value: 0 } }; }
        createScriptProcessor() {
          const processor = { ...node(), onaudioprocess: null as null | ((event: unknown) => void) };
          window.setTimeout(() => processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } }), 50);
          return processor;
        }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    });
    await page.addStyleTag({ content: build.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n') });
    const health = page.waitForResponse(response => response.url().endsWith('/api/ai/status'));
    await page.addScriptTag({ content: build.outputFiles.find(file => file.path.endsWith('.js'))!.text });
    await (await health).finished();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } })));
    await page.getByTestId('voice-preview-button').click();
    await expect(page.getByTestId('voice-listening-visualizer')).toBeVisible();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'J’ai fini de parler' }).click();
    await expect(page.locator('.ava-overlay')).toHaveCount(0);
    expect(planningCalls).toBe(1); expect(executionCalls).toBe(1);
    await expect(page.getByRole('button', { name: 'Valider et exécuter' })).toHaveCount(0);
    if (kind === 'quote') {
      const sheet = page.getByRole('dialog', {name:'Fiche du devis'});
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText('Papier peint');
      await expect(sheet).toContainText('À préciser');
      await sheet.getByRole('button', {name:'Actions du devis'}).click();
      await page.getByRole('dialog', {name:'Actions du devis'}).getByRole('button', {name:'Modifier le devis'}).click();
      await expect(page.locator('.rm-v2-editor')).toBeVisible();
      await expect(page.locator('.rm-v2-editor input[value="Papier peint"]')).toHaveCount(1);
    } else if (kind === 'customer') await expect(page.locator('.rm-detail-sheet')).toBeVisible();
    else {
      await expect(page.locator('.rm-detail-sheet')).toBeVisible();
      await expect(page.locator('.rm-detail-sheet h2')).toHaveText(document.number);
      await page.locator('.rm-detail-sheet').getByRole('button', { name: 'Tout modifier' }).click();
      await expect(page.locator('.rm-v2-editor')).toBeVisible();
      await expect(page.locator('.rm-v2-editor input[value="Papier peint"]')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`direct-${kind}.png`), fullPage: true });
  });
}
