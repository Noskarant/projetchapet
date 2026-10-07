import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const bundle = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Commercial from './app/mobile-commercial-demo';
import AutoPreview from './app/mobile-auto-pdf-preview';
import UnifiedSheet from './app/mobile-unified-quote-sheet';
import ActionsMenu from './app/mobile-philippe-quote-actions-menu';
import EmailBridge from './app/authenticated-email-fetch-bridge';
import {seedMobileWorkspace} from './lib/mobile-prototype';
import {seedCommercialDemoState,writeCommercialDemoState} from './lib/mobile-commercial-demo';
import './app/mobile-commercial-demo.css';
import './app/mobile-quote-preview.css';
import './app/mobile-quote-preview-scroll-fix.css';
const workspace=seedMobileWorkspace(); const quote=workspace.quotes[0];
const customer=workspace.customers.find(c=>c.id===quote.customerId);
customer.emails=location.search.includes('empty')?[]:['client@example.fr'];
localStorage.setItem('projetchapet-mobile-workspace-v3',JSON.stringify(workspace));
const commercial=seedCommercialDemoState();commercial.company.displayName='Atelier Test';writeCommercialDemoState(localStorage,commercial);
window.fixture={number:quote.number,customerId:customer.id};
createRoot(document.getElementById('root')).render(<><button onClick={()=>window.dispatchEvent(new CustomEvent('manufeo:open-created-quote',{detail:{quote,customer}}))}>Afficher le devis</button><AutoPreview/><UnifiedSheet/><ActionsMenu/><Commercial/><EmailBridge/></>);
` }, bundle: true, write: false, outdir: '/tmp/mail-compose', jsx: 'automatic', minify: true,
define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED: '0', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) }, tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text.replace(/<\/script/giu,'<\\/script')}</script></body></html>`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: '22222222-2222-4222-8222-222222222222', email: 'artisan@example.fr' } })));
  await page.route('https://backend.manufeo.test/**', route => route.fulfill({ json: [] }));
  await page.route('https://compose.manufeo.test/**', route => route.request().url().endsWith('/pdf.worker.min.mjs') ? route.fulfill({ contentType:'text/javascript', body: readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')) }) : route.fulfill({ contentType:'text/html', body:html }));
});

async function open(page: Page, empty = false) {
  await page.goto(`https://compose.manufeo.test/${empty ? '?empty' : ''}`);
  await page.getByRole('button', { name: 'Afficher le devis', exact: true }).click();
  await page.getByRole('button', { name: 'Envoyer le devis', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Envoyer le devis', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of [390, 1100]) test(`fenêtre ${width} : message conservé, annulation sans envoi, destinataires éditables et PDF joint`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const sends: Array<Record<string, any>> = [];
  await page.route('https://compose.manufeo.test/api/email', route => {
    expect(route.request().headers().authorization).toBe('Bearer test-token');
    sends.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: 'sent-test' } });
  });
  const dialog = await open(page);
  expect(sends).toHaveLength(0);
  const number = await page.evaluate(() => (window as any).fixture.number);
  await expect(dialog.getByRole('textbox', { name: /^Destinataires/ })).toHaveValue('client@example.fr');
  const current = `Bonjour,\n\nVeuillez trouver votre devis ${number} en pièce jointe.\n\nCordialement,\nAtelier Test`;
  await expect(dialog.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(current);
  await expect(dialog.getByRole('checkbox', { name: /^Ajoutez-moi/ })).toBeChecked();
  const bounds = await dialog.locator('section').boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(480); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click(); expect(sends).toHaveLength(0);
  await page.getByRole('button', { name: 'Envoyer le devis', exact: true }).click();
  await dialog.getByRole('textbox', { name: /^Destinataires/ }).fill('autre@example.fr, client@example.fr');
  await dialog.getByRole('textbox', { name: 'Objet', exact: true }).fill('Devis à vérifier');
  await dialog.getByRole('textbox', { name: 'Message', exact: true }).fill('Bonjour,\nVoici votre devis <à vérifier>.');
  await dialog.getByRole('button', { name: 'Envoyer avec le PDF', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({ to:['autre@example.fr','client@example.fr'], copyToSelf:true, customRecipient:true, subject:'Devis à vérifier', documentNumber:number, documentKind:'quote' });
  expect(sends[0].html).toContain('&lt;à vérifier&gt;');
  expect(sends[0].attachments).toHaveLength(1); expect(sends[0].attachments[0].filename).toBe(`${number}.pdf`);
  expect(Buffer.from(sends[0].attachments[0].content,'base64').subarray(0,4).toString()).toBe('%PDF');
});

test('envoi refusé : erreur dans la fenêtre, texte conservé et option sans prix prise en compte', async ({ page }) => {
  await page.setViewportSize({ width:1100, height:760 });
  const sends: Array<Record<string, any>> = [];
  await page.route('https://compose.manufeo.test/api/email', route => { sends.push(route.request().postDataJSON()); return route.fulfill({ status:503, json:{ error:'Service temporairement indisponible.' } }); });
  const dialog = await open(page);
  await dialog.getByRole('textbox', { name: /^Destinataires/ }).fill('client@example.fr, invalide');
  await dialog.getByRole('button', { name: 'Envoyer avec le PDF', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Adresse du destinataire invalide'); expect(sends).toHaveLength(0);
  await dialog.getByRole('textbox', { name: /^Destinataires/ }).fill('client@example.fr');
  await dialog.getByRole('checkbox', { name: /^Ajoutez-moi/ }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Joindre la version chantier sans prix' }).check();
  await dialog.getByRole('textbox', { name: 'Message', exact: true }).fill('Texte à conserver après une erreur.');
  await dialog.getByRole('button', { name: 'Envoyer avec le PDF', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Service temporairement indisponible');
  await expect(dialog.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Texte à conserver après une erreur.');
  expect(sends).toHaveLength(1); expect(sends[0].copyToSelf).toBe(false); expect(sends[0].attachments[0].filename).toMatch(/-sans-prix\.pdf$/);
  await page.screenshot({ path:'tmp/document-email-compose-tablet.png', animations:'disabled' });
});

test('client sans e-mail : fenêtre disponible, adresse manuelle sans modifier la fiche client', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  let sends = 0;
  await page.route('https://compose.manufeo.test/api/email', route => { sends++; return route.fulfill({ json:{ id:'sent-test' } }); });
  const dialog = await open(page, true);
  await expect(dialog.getByRole('textbox', { name:/^Destinataires/ })).toHaveValue('');
  await dialog.getByRole('textbox', { name:/^Destinataires/ }).fill('manuel@example.fr');
  await dialog.getByRole('button', { name:'Envoyer avec le PDF', exact:true }).click();
  await expect(dialog).toHaveCount(0); expect(sends).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('projetchapet-mobile-workspace-v3')!).customers.find((customer:any)=>customer.id===(window as any).fixture.customerId).emails)).toEqual([]);
});
