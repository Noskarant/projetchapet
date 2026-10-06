import { test, expect, type Page, type Locator } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seedMobileWorkspace } from '../lib/mobile-prototype';

const root = path.resolve(__dirname, '..');
const css = [...readFileSync(path.join(root, 'app/layout.tsx'), 'utf8').matchAll(/import "(\.\/[^"\n]+\.css)"/g)]
  .map(match => `import './app/${match[1].slice(2)}';`).join('\n');
const build = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './app/rappidos-mobile-shell-v2';
import Edit from './app/mobile-voice-edit-assistant';
import Assistant from './app/action-voice-assistant';
import Copilot from './app/mobile-copilot-assistant';
import Dictation from './app/mobile-copilot-dictation-bridge';
${css}
createRoot(document.getElementById('root')).render(<><Shell/><Edit/><Assistant/><Copilot/><Dictation/></>);
` }, bundle: true, write: false, external: ['/*.webp', '/*.svg'], outdir: '/tmp/customer-microphone-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://microphone-backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${build.outputFiles.filter(f => f.path.endsWith('.css')).map(f => f.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(f => f.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;

async function fixture(page: Page, errorName = 'NotFoundError') {
  const workspace = seedMobileWorkspace();
  Object.assign(workspace.customers[2], { civility: 'M. et Mme', lastName: 'Durand Couple', firstName: '' });
  Object.assign(workspace.quotes[0], { customerId: workspace.customers[2].id, customerName: 'M. et Mme Durand Couple' });
  await page.addInitScript(({ workspace, errorName }) => {
    if (!localStorage.getItem('projetchapet-mobile-workspace-v3')) localStorage.setItem('projetchapet-mobile-workspace-v3', JSON.stringify(workspace));
    localStorage.setItem('sb-microphone-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '22222222-2222-4222-8222-222222222222' } }));
    const state = { errorName, requests: 0, stops: 0, closed: 0, fallback: 0 };
    Object.assign(window, { microphoneTest: state });
    class Audio {
      state = 'running'; sampleRate = 16000; destination = {};
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; state.closed++; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
      createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
      createAnalyser() { return { fftSize: 1024, disconnect() {}, getFloatTimeDomainData(samples: Float32Array) { samples.fill(.06); } }; }
    }
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/mp4'; ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(1024)], { type: this.mimeType }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    class Speech { start() { state.fallback++; } stop() {} }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Audio });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: Speech });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      state.requests++;
      if (state.errorName) throw new DOMException('Requested device not found', state.errorName);
      return { getTracks: () => [{ stop() { state.stops++; } }] };
    } } });
  }, { workspace, errorName });
  await page.route('https://microphone-backend.manufeo.test/**', route => route.fulfill({ json: route.request().url().includes('ensure_personal_organization') ? '11111111-1111-4111-8111-111111111111' : [] }));
  const state = { transcriptions: 0, actions: 0 };
  await page.route('https://customer-microphone.manufeo.test/**', route => {
    const url = route.request().url();
    if (url.endsWith('/api/ai/status')) return route.fulfill({ json: { groq: true } });
    if (url.endsWith('/api/transcribe')) { state.transcriptions++; return route.fulfill({ json: { text: 'Comment envoyer une facture ?' } }); }
    if (url.endsWith('/api/ai/help')) { state.actions++; return route.fulfill({ json: { answer: 'Ouvrez la facture puis Envoyer.' } }); }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://customer-microphone.manufeo.test/');
  await expect(page.locator('.rm-header h1')).toHaveText('Devis');
  return { workspace, state };
}

test('création et modification : Particulier à gauche, trois civilités et couple conservé après sauvegarde', async ({ page }) => {
  const { workspace } = await fixture(page);
  await page.locator('.rm-bottom-nav').getByRole('button', { name: 'Clients', exact: true }).click();
  await page.locator('.rm-create-main').click();
  const editor = page.locator('.rm-v2-editor');
  await expect(editor.locator('.rm-kind-switch button')).toHaveText(['Particulier', 'Professionnel']);
  await editor.getByRole('button', { name: 'Particulier', exact: true }).click();
  await expect(editor.getByLabel('Civilité').locator('option')).toHaveText(['M.', 'Mme', 'M. et Mme']);
  await editor.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.locator('.rm-client-card').filter({ hasText: 'Durand Couple' }).click();
  await page.locator('.rm-detail-sheet header button').last().click();
  await expect(editor.getByLabel('Civilité')).toHaveValue('M. et Mme');
  await editor.getByLabel('Ville', { exact: true }).fill('Lyon');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!));
  expect(saved.customers.find((c: { id: string }) => c.id === workspace.customers[2].id).civility).toBe('M. et Mme');
  expect(saved.quotes[0].customerId).toBe(workspace.quotes[0].customerId);
  expect(saved.quotes[0].customerName).toBe('M. et Mme Durand Couple');
  await page.reload();
  await page.locator('.rm-bottom-nav').getByRole('button', { name: 'Clients', exact: true }).click();
  await page.locator('.rm-client-card').filter({ hasText: 'Durand Couple' }).click();
  await page.locator('.rm-detail-sheet header button').last().click();
  await expect(editor.getByLabel('Civilité')).toHaveValue('M. et Mme');
  await expect(editor.getByLabel('Ville', { exact: true })).toHaveValue('Lyon');
});

async function openVoice(page: Page, flow: string): Promise<{ dialog: Locator; start: Locator; input: Locator; close: Locator }> {
  if (flow === 'aide') {
    await page.getByRole('button', { name: 'Questions à MANUFEO', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Posez votre question', exact: true });
    return { dialog, start: dialog.getByRole('button', { name: 'Parler à MANUFEO', exact: true }), input: dialog.getByRole('textbox', { name: 'Votre question', exact: true }), close: dialog.getByRole('button', { name: 'Fermer les questions à l’agent', exact: true }) };
  }
  if (flow === 'copilote') {
    await page.locator('.mcp-launcher').evaluate((button: HTMLButtonElement) => button.click());
    const dialog = page.getByRole('dialog', { name: 'Copilote chantier', exact: true });
    return { dialog, start: dialog.locator('.mcp-dictation'), input: dialog.getByLabel('Description du chantier'), close: dialog.getByRole('button', { name: 'Fermer le copilote', exact: true }) };
  }
  if (flow === 'création') {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } })));
  } else {
    await page.locator('.rm-document-card').first().click();
    await page.locator('.rm-detail-sheet [data-voice-edit]').click();
  }
  const dialog = page.getByRole('dialog', { name: flow === 'création' ? 'Assistant vocal MANUFEO' : 'Modifier à la voix', exact: true });
  return { dialog, start: dialog.getByRole('button', { name: 'Démarrer la dictée vocale', exact: true }), input: dialog.locator('textarea').first(), close: dialog.getByRole('button', { name: 'Fermer', exact: true }) };
}

for (const flow of ['aide', 'création', 'modification', 'copilote']) {
  for (const [errorName, expected] of [['NotFoundError', 'Aucun microphone détecté'], ['NotAllowedError', 'Micro refusé'], ['NotReadableError', 'Le micro n’est pas accessible']]) {
    test(`${flow} : ${errorName} expliqué en français, clavier disponible et nouvelle tentative possible`, async ({ page }) => {
      const { state } = await fixture(page, errorName);
      const { dialog, start, input, close } = await openVoice(page, flow);
      await start.click();
      await expect(dialog).toContainText(expected);
      await expect(dialog).not.toContainText('Requested device not found');
      await expect(input).toBeEnabled();
      await input.fill('Demande conservée au clavier');
      await expect(input).toHaveValue('Demande conservée au clavier');
      expect(state.transcriptions).toBe(0); expect(state.actions).toBe(0);
      await page.evaluate(() => { (window as unknown as { microphoneTest: { errorName: string } }).microphoneTest.errorName = ''; });
      await start.click();
      await expect(dialog.getByRole('button', { name: flow === 'aide' ? 'Terminer et envoyer' : flow === 'copilote' ? 'Arrêter la dictée' : 'J’ai fini de parler', exact: true })).toBeVisible();
      await close.click();
      await expect(dialog).toHaveCount(0);
      const mic = await page.evaluate(() => (window as unknown as { microphoneTest: { stops: number; requests: number; closed: number; fallback: number } }).microphoneTest);
      expect(mic.requests).toBe(2); expect(mic.stops).toBe(1); expect(mic.fallback).toBe(0);
      if (flow !== 'copilote') expect(mic.closed).toBe(2);
      expect(state.transcriptions).toBe(0); expect(state.actions).toBe(0);
    });
  }
}
