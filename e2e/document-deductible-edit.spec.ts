import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fallbackMobileVoiceCommand, sanitizeMobileVoiceCommand } from '../lib/mobile-voice-command';

const root = process.cwd();
const build = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Edit from './app/mobile-voice-edit-assistant';import AutoPreview from './app/mobile-auto-pdf-preview';
import {seedMobileWorkspace,calculateTotals} from './lib/mobile-prototype';
import {applySpokenPercentageLines} from './lib/percentage-adjustments';
import './app/mobile-quote-preview.css';import './app/mobile-quote-preview-scroll-fix.css';
const key='projetchapet-mobile-workspace-v3';
if(!localStorage.getItem(key)){
 const workspace=seedMobileWorkspace();const items=applySpokenPercentageLines([{id:'work',label:'Porte-fenêtre PVC',description:'Fourniture et pose',quantity:1,unit:'forfait',unitPrice:2640,taxRate:10}],'RSE 1 %');
 workspace.quotes=[{...workspace.quotes[0],items,notes:'Franchise : 135 € TTC à déduire. Assurance : MAIF, dossier M260849658N.',...calculateTotals(items)}];
 localStorage.setItem(key,JSON.stringify(workspace));
}
const quote=JSON.parse(localStorage.getItem(key)).quotes[0];
createRoot(document.getElementById('root')).render(<><section className="rm-detail-sheet"><header><small>DEVIS</small><h2>{quote.number}</h2></header><div className="rm-detail-actions"/></section><button onClick={()=>{const state=JSON.parse(localStorage.getItem(key));window.dispatchEvent(new CustomEvent('manufeo:open-created-quote',{detail:{quote:state.quotes[0],customer:state.customers.find(c=>c.id===state.quotes[0].customerId)}}))}}>Afficher le devis</button><Edit/><AutoPreview/></>);
` }, bundle: true, write: false, outdir: '/tmp/deductible-edit-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED: '0', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) }, tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${build.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;

for (const width of [390, 1100]) test(`franchise et remise à ${width}px : confirmation, sauvegarde, reprise et PDF`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '22222222-2222-4222-8222-222222222222' } })));
  await page.route('https://backend.manufeo.test/**', route => route.fulfill({ json: [] }));
  await page.route('https://deductible.manufeo.test/**', route => route.request().url().endsWith('/pdf.worker.min.mjs') ? route.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')) }) : route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/ai/command', route => {
    const body = route.request().postDataJSON();
    const fallback = fallbackMobileVoiceCommand(body.transcript, body.target, body.workspace);
    // Reproduce the real omission: the model returns the franchise only in notes.
    return route.fulfill({ json: { data: sanitizeMobileVoiceCommand({ changes: { notes: body.target.data.notes }, line_operations: [] }, fallback) } });
  });
  await page.clock.install();
  await page.goto('https://deductible.manufeo.test/');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('[data-voice-edit]').click();
    const dialog = page.getByRole('dialog', { name: 'Modifier à la voix', exact: true });
    await dialog.getByRole('textbox').fill('Mets une remise de 4 % et déduis une franchise de 135 euros TTC.');
    await dialog.getByRole('button', { name: 'Analyser', exact: true }).click();
    await expect(dialog.locator('ul')).toContainText('Déduire la franchise : 135,00 € TTC');
    if (!attempt) {
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!).quotes[0].items.length);
      expect(before).toBe(2); // Review cannot change the document before confirmation.
    }
    const refresh = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog.getByText('La modification a été enregistrée.', { exact: true })).toBeVisible();
    await page.clock.runFor(700); await refresh; await page.waitForLoadState('load');
  }
  const saved = await page.evaluate(() => {
    const quote = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!).quotes[0];
    return { items: quote.items, meta: JSON.parse(localStorage.getItem('projetchapet-mobile-quote-meta-v1')!)[quote.number] };
  });
  expect(saved.items).toHaveLength(3); expect(saved.items[2].unitPrice).toBe(-122.73); expect(saved.meta.discountPercent).toBe(4);
  await page.getByRole('button', { name: 'Afficher le devis', exact: true }).click();
  const preview = page.locator('.rm-philippe-preview-backdrop');
  await expect(preview.locator('.rm-philippe-line-card').filter({ hasText: 'Franchise à déduire' })).toContainText('-122,73');
  await expect(preview.locator('.rm-philippe-totals')).toContainText('2 680,71');
  await expect(preview.locator('.rm-philippe-totals')).not.toContainText('Montant après franchise');
  await page.screenshot({ path: testInfo.outputPath('deductible-applied.png'), animations: 'disabled' });
  await preview.getByRole('button', { name: 'Page complète', exact: true }).click();
  await expect(preview.locator('canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});
