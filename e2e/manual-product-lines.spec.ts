import { test, expect, type Page, type Locator } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seedMobileWorkspace } from '../lib/mobile-prototype';

const root = process.cwd();
const css = [...readFileSync(path.join(root, 'app/layout.tsx'), 'utf8').matchAll(/import "(\.\/[^"\n]+\.css)"/g)].map(match => `import './app/${match[1].slice(2)}';`).join('\n');
const bundle = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './app/rappidos-mobile-shell-v2';import Polish from './app/mobile-priority-polish';
${css}
createRoot(document.getElementById('root')).render(<><Shell/><Polish/></>);
` }, bundle: true, write: false, external: ['/*.webp', '/*.svg'], outdir: '/tmp/manual-product-lines', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key', NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED: '0' }) }, tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const workspace = seedMobileWorkspace();

async function fixture(page: Page, width: number, kind: 'quote' | 'invoice') {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(workspace => {
    if (!localStorage.getItem('projetchapet-mobile-workspace-v3')) localStorage.setItem('projetchapet-mobile-workspace-v3', JSON.stringify(workspace));
    localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '22222222-2222-4222-8222-222222222222' } }));
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'denied' }) } });
  }, workspace);
  await page.route('https://backend.manufeo.test/**', route => route.fulfill({ json: [] }));
  await page.route('https://manual.manufeo.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://manual.manufeo.test/');
  await page.getByRole('button', { name: kind === 'quote' ? 'Devis' : 'Factures', exact: true }).click();
  return errors;
}

async function fillLine(line: Locator, label: string, quantity: string, tax: string) {
  await line.getByPlaceholder('Désignation', { exact: true }).fill(label);
  await line.getByPlaceholder('Description', { exact: true }).fill('Renseigné manuellement');
  await line.getByLabel('Quantité', { exact: true }).fill(quantity);
  await line.getByLabel('Unité', { exact: true }).fill('forfait');
  await line.getByLabel('Prix HT', { exact: true }).fill('100');
  await line.getByLabel('TVA %', { exact: true }).fill(tax);
}

for (const width of [320, 820, 1440]) for (const kind of ['quote', 'invoice'] as const) test(`${kind} manuel à ${width}px : lignes à la demande, focus, saisie, suppression et sauvegarde`, async ({ page }) => {
  const errors = await fixture(page, width, kind);
  await page.getByRole('button', { name: 'Créer manuellement', exact: true }).click();
  const editor = page.locator('.rm-v2-editor'); const lines = editor.locator('.rm-v2-lines article');
  await expect(lines).toHaveCount(0);
  const number = await editor.getByLabel('Numéro', { exact: true }).inputValue();
  const add = editor.getByRole('button', { name: 'Produits et services : ajouter une ligne', exact: true });
  await add.scrollIntoViewIfNeeded();
  await expect(add).toBeVisible();
  expect(await add.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `tmp/manual-product-lines-${kind}-${width}.png`, animations: 'disabled' });
  // Click the text that previously had no action, rather than the old small plus.
  await add.getByText('Produits et services', { exact: true }).click();
  await expect(lines).toHaveCount(1);
  await expect(lines.first().getByPlaceholder('Désignation', { exact: true })).toBeFocused();
  await fillLine(lines.first(), 'Prestation manuelle', '2', '10');
  // Native keyboard activation also adds exactly one blank line.
  await add.focus(); await page.keyboard.press('Enter');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(1).getByPlaceholder('Désignation', { exact: true })).toBeFocused();
  await expect(lines.nth(1).getByLabel('Prix HT', { exact: true })).toHaveValue('');
  await fillLine(lines.nth(1), 'Fourniture manuelle', '1', '20');
  await add.click(); await expect(lines).toHaveCount(3);
  await lines.nth(2).getByPlaceholder('Désignation', { exact: true }).fill('À supprimer');
  await lines.nth(2).getByRole('button', { name: 'Supprimer la ligne 3', exact: true }).click();
  await expect(lines).toHaveCount(2);
  await expect(lines.first().getByPlaceholder('Désignation', { exact: true })).toHaveValue('Prestation manuelle');
  // Clearing a draft designation must not produce null or crash saving.
  await add.click();
  await lines.nth(2).getByPlaceholder('Désignation', { exact: true }).fill('Brouillon');
  await lines.nth(2).getByPlaceholder('Désignation', { exact: true }).fill('');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => page.evaluate(({ kind, number }) => {
    const state = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!);
    return (kind === 'quote' ? state.quotes : state.invoices).find((doc: { number: string }) => doc.number === number)?.total;
  }, { kind, number })).toBe(340);
  await page.reload();
  const saved = await page.evaluate(({ kind, number }) => {
    const state = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!);
    return (kind === 'quote' ? state.quotes : state.invoices).find((doc: { number: string }) => doc.number === number);
  }, { kind, number });
  expect(saved.items).toHaveLength(2);
  expect(saved.items.map((line: { label: string }) => line.label)).toEqual(['Prestation manuelle', 'Fourniture manuelle']);
  expect(saved.subtotal).toBe(300); expect(saved.taxTotal).toBe(40);
  expect(errors).toEqual([]);
});

for (const kind of ['quote', 'invoice'] as const) test(`${kind} existant : ajouter une ligne conserve les prestations, annuler ne modifie rien`, async ({ page }) => {
  const errors = await fixture(page, 820, kind);
  const original = (kind === 'quote' ? workspace.quotes : workspace.invoices)[0];
  await page.getByPlaceholder(kind === 'quote' ? 'Rechercher un devis' : 'Rechercher une facture').fill(original.number);
  await page.locator('.rm-document-card').first().click();
  await page.locator('.rm-detail-sheet').getByRole('button', { name: 'Tout modifier', exact: true }).click();
  const editor = page.locator('.rm-v2-editor');
  await expect(editor.locator('.rm-v2-lines article')).toHaveCount(original.items.length);
  await editor.getByRole('button', { name: 'Produits et services : ajouter une ligne', exact: true }).click();
  await expect(editor.locator('.rm-v2-lines article')).toHaveCount(original.items.length + 1);
  await expect(editor.getByPlaceholder('Désignation', { exact: true }).first()).toHaveValue(original.items[0].label);
  await editor.locator(':scope > header > button').click();
  const saved = await page.evaluate(({ kind, id }) => {
    const state = JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!);
    return (kind === 'quote' ? state.quotes : state.invoices).find((doc: { id: string }) => doc.id === id);
  }, { kind, id: original.id });
  expect(saved).toEqual(original); expect(errors).toEqual([]);
});
