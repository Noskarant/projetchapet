import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seedMobileWorkspace, calculateTotals } from '../lib/mobile-prototype';
import { fallbackMobileVoiceCommand } from '../lib/mobile-voice-command';

const root = path.resolve(__dirname, '..');
const css = [...readFileSync(path.join(root, 'app/layout.tsx'), 'utf8').matchAll(/import "(\.\/[^"\n]+\.css)"/g)].map(match => `import './app/${match[1].slice(2)}';`).join('\n');
const bundle = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './app/rappidos-mobile-shell-v2';import Edit from './app/mobile-voice-edit-assistant';
import Assistant from './app/action-voice-assistant';import Polish from './app/mobile-priority-polish';
import Splash from './app/manufeo-splash';
${css}
createRoot(document.getElementById('root')).render(<Splash><Shell/><Polish/><Edit/><Assistant/></Splash>);
` }, bundle: true, write: false, external: ['/*.webp', '/*.svg'], outdir: '/tmp/philippe-oct5-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key', NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED: '0' }) }, tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const workspace = seedMobileWorkspace();
const items = [
  { id: 'bath-1', label: 'Salle de bain, préparation des supports', description: '', quantity: 1, unit: 'unité', unitPrice: 1700, taxRate: 10 },
  { id: 'kitchen', label: 'Cuisine, peinture des murs', description: '', quantity: 27, unit: 'm²', unitPrice: 27, taxRate: 10 },
  { id: 'bath-2', label: 'Salle de bain, peinture de finition', description: '', quantity: 5, unit: 'm²', unitPrice: 31, taxRate: 20 },
];
workspace.quotes[0].items = items; Object.assign(workspace.quotes[0], calculateTotals(items));
workspace.invoices[0].items = items; Object.assign(workspace.invoices[0], calculateTotals(items));

async function fixture(page: Page, width = 390, geo: 'prompt' | 'granted' | 'denied' = 'prompt') {
  await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const state = { weather: 0, locations: 0 };
  await page.addInitScript(({ workspace, geo }) => {
    localStorage.setItem('projetchapet:company-profile:v1', JSON.stringify({ startupSoundEnabled: false }));
    if (!localStorage.getItem('projetchapet-mobile-workspace-v3')) localStorage.setItem('projetchapet-mobile-workspace-v3', JSON.stringify(workspace));
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: geo }) } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: (position: unknown) => void, failure: (error: unknown) => void) => {
      (window as unknown as { locationCalls: number }).locationCalls = ((window as unknown as { locationCalls?: number }).locationCalls || 0) + 1;
      if (geo === 'denied') failure({ code: 1 }); else success({ coords: { latitude: 45.713456, longitude: 4.812345 } });
    } } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('Microphone refused', 'NotAllowedError'); } } });
  }, { workspace, geo });
  await page.route('https://backend.manufeo.test/**', route => route.fulfill({ json: [] }));
  await page.route('https://artisan.manufeo.test/**', async route => {
    const url = route.request().url();
    if (/\.(?:webp|svg)$/.test(url)) return route.fulfill({ contentType: url.endsWith('.svg') ? 'image/svg+xml' : 'image/webp', body: readFileSync(path.join(root, 'public', path.basename(new URL(url).pathname))) });
    if (url.includes('/api/weather?')) {
      state.weather++; const query = new URL(url).searchParams;
      expect(query.get('lat')).toBe('45.71'); expect(query.get('lon')).toBe('4.81');
      return route.fulfill({ json: { temperature: 13, symbol: 'partlycloudy_day', time: new Date().toISOString() } });
    }
    if (url.endsWith('/api/ai/command')) {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { data: fallbackMobileVoiceCommand(body.transcript, body.target, body.workspace) } });
    }
    if (url.endsWith('/api/ai/status')) return route.fulfill({ json: { groq: true } });
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  // Advance the existing intro and save timers deterministically across reloads.
  await page.clock.install();
  await page.goto('https://artisan.manufeo.test/');
  await page.clock.runFor(2100);
  await expect(page.locator('.manufeo-splash')).toHaveCount(0);
  return { errors, state };
}

for (const width of [320, 820, 1440]) for (const entity of ['Devis', 'Factures']) test(`${entity} à ${width}px : recherche, gros bouton IA et modification vocale uniforme sans changer les montants`, async ({ page }, testInfo) => {
  const { errors } = await fixture(page, width);
  await page.getByRole('button', { name: entity, exact: true }).click();
  const search = page.getByPlaceholder(entity === 'Devis' ? 'Rechercher un devis' : 'Rechercher une facture');
  expect(await search.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await search.evaluate(el => getComputedStyle(el.parentElement!).borderTopColor)).toBe('rgb(255, 255, 255)');
  const label = entity === 'Devis' ? workspace.quotes[0].customerName : workspace.invoices[0].customerName;
  await search.fill(label); await expect(page.locator('.rm-document-card')).toHaveCount(1);
  const dock = await page.locator('.rm-create-main').boundingBox(); expect(dock!.height).toBeGreaterThanOrEqual(88);
  expect(await page.locator('.rm-document-main strong').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const list = page.locator('.rm-list-scroll'); await list.evaluate(el => el.scrollTop = el.scrollHeight);
  const card = await page.locator('.rm-document-card').first().boundingBox(); expect(card!.y + card!.height).toBeLessThanOrEqual(dock!.y);
  await page.screenshot({ path: testInfo.outputPath('list.png') });
  await page.locator('.rm-document-card').first().click();
  await page.locator('.rm-detail-sheet').getByRole('button', { name: 'Tout modifier', exact: true }).click();
  await page.locator('.rm-v2-editor').getByRole('button', { name: 'Modifier à la voix' }).click();
  const edit = page.getByRole('dialog', { name: 'Modifier à la voix' });
  await expect(edit.locator('.ava-voice-preview .manufeo-mascot')).toBeVisible();
  const panelColor = await edit.locator('.ava-panel').evaluate(el => getComputedStyle(el).backgroundColor);
  await page.screenshot({ path: testInfo.outputPath('voice-edit.png') });
  await edit.getByRole('textbox').fill('Rassemble les postes de la salle de bain ensemble et ceux de la cuisine ensemble.');
  await edit.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Appliquer', exact: true })).toBeVisible();
  const refresh = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  await edit.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect.poll(async () => page.evaluate(entity => {
    const stored = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!);
    return (entity === 'Devis' ? stored.quotes : stored.invoices)[0].items.map((item: { id: string }) => item.id);
  }, entity)).toEqual(['bath-1', 'bath-2', 'kitchen']);
  const saved = await page.evaluate(entity => { const data = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!); return (entity === 'Devis' ? data.quotes : data.invoices)[0]; }, entity);
  expect(saved.total).toBe(calculateTotals(items).total);
  expect(saved.items.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))).toEqual([...items].sort((a, b) => a.id.localeCompare(b.id)));
  await page.clock.runFor(700); await refresh; await page.waitForLoadState('load'); await page.clock.runFor(2100); await expect(page.locator('.manufeo-splash')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } })));
  await expect(page.locator('.ava-panel')).toBeVisible();
  expect(await page.locator('.ava-panel').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(panelColor);
  await expect(page.locator('.ava-voice-preview .manufeo-mascot')).toBeVisible();
  expect(errors).toEqual([]);
});

test('météo : localisation à la demande et erreur de permission sans bloquer l’application', async ({ page }) => {
  const { errors, state } = await fixture(page, 390, 'prompt');
  await page.getByRole('button', { name: 'Accueil', exact: true }).click();
  const activate = page.getByRole('button', { name: 'Activer la météo locale' });
  await expect(activate).toBeVisible(); expect(state.weather).toBe(0);
  await activate.click(); await expect(page.getByRole('button', { name: /Météo locale : Éclaircies, 13 degrés/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /MET Norway/ })).toBeVisible(); expect(state.weather).toBe(1);
  await page.getByRole('button', { name: 'Devis', exact: true }).click(); await expect(page.getByPlaceholder('Rechercher un devis')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fermer une analyse vocale abandonne sa réponse tardive', async ({ page }) => {
  const { errors } = await fixture(page);
  let release!: () => void;
  const deferred = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const received = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/api/ai/command', async route => {
    requested(); await deferred;
    await route.fulfill({ json: { data: { entity: 'quote', id: workspace.quotes[0].id, summary: 'Ancienne analyse', changes: { status: 'Terminé' } } } });
  });
  await page.getByRole('button', { name: 'Devis', exact: true }).click();
  await page.locator('.rm-document-card').first().click();
  await page.locator('.rm-detail-sheet').getByRole('button', { name: 'Tout modifier', exact: true }).click();
  const open = page.locator('.rm-v2-editor').getByRole('button', { name: 'Modifier à la voix' });
  await open.click();
  const edit = page.getByRole('dialog', { name: 'Modifier à la voix' });
  await edit.getByRole('textbox').fill('Rassemble les lignes par pièce.');
  await edit.getByRole('button', { name: 'Analyser', exact: true }).click();
  await received;
  await edit.getByRole('button', { name: 'Fermer', exact: true }).click();
  await open.click();
  const response = page.waitForResponse('**/api/ai/command'); release(); await response;
  await expect(edit.getByRole('textbox')).toHaveValue('');
  await expect(edit.getByRole('button', { name: 'Analyser', exact: true })).toBeVisible();
  await expect(edit.getByText('Ancienne analyse')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('météo autorisée automatiquement et lancement inchangé avec un texte plus grand', async ({ page }) => {
  const { errors } = await fixture(page, 390, 'granted');
  await page.getByRole('button', { name: 'Accueil', exact: true }).click();
  await expect(page.getByRole('button', { name: /Météo locale : Éclaircies, 13 degrés/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Votre journée commence ici', { exact: true })).toBeVisible();
  expect(await page.locator('.manufeo-splash-caption').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
  await page.clock.runFor(2100);
  await expect(page.locator('.manufeo-splash')).toHaveCount(0, { timeout: 4000 });
  expect(errors).toEqual([]);
});

test('météo refusée : message discret, aucune requête et navigation disponible', async ({ page }) => {
  const { state, errors } = await fixture(page, 390, 'denied');
  await page.getByRole('button', { name: 'Accueil', exact: true }).click();
  await page.getByRole('button', { name: 'Activer la météo locale' }).click();
  await expect(page.getByRole('status')).toContainText('Autorise la localisation'); expect(state.weather).toBe(0);
  await page.getByRole('button', { name: 'Factures', exact: true }).click(); await expect(page.getByPlaceholder('Rechercher une facture')).toBeVisible();
  expect(errors).toEqual([]);
});
