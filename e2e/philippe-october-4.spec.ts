import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';

const root = path.resolve(__dirname, '..');
const build = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import Assistant from './app/action-voice-assistant';
import Shell from './app/mobile-workspace-live-shell';
import './app/rappidos-mobile-shell.css';
import {EmailPanel} from './app/mobile-commercial-panels';
import {seedMobileWorkspace} from './lib/mobile-prototype';
import {sendAuthenticatedDocumentEmail} from './lib/authenticated-email';
import './app/mobile-commercial-demo.css';
function EmailHarness(){
 const [draft,setDraft]=React.useState({document:seedMobileWorkspace().invoices[0],recipient:'client@example.fr',subject:'Votre facture',message:'Bonjour,\\n\\nVeuillez trouver votre facture.\\n\\nCordialement',withoutPrices:false});
 const [message,setMessage]=React.useState('');
 return <div className="rm-commercial-backdrop"><section className="rm-commercial-panel"><EmailPanel draft={draft} busy={false} message={message} onChange={setDraft} onSend={()=>void sendAuthenticatedDocumentEmail({documentNumber:draft.document.number,documentKind:'invoice',to:draft.recipient,customRecipient:true,attachments:[{filename:'facture.pdf',content:'JVBERi0xLjc='}]}).then(()=>setMessage('Envoyé.')).catch(error=>setMessage(error.message))} onCancel={()=>{}}/></section></div>;
}
createRoot(document.getElementById('root')).render(window.location.pathname==='/email'?<EmailHarness/>:<><Shell/><Assistant/></>);
` }, bundle: true, write: false, outdir: '/tmp/philippe-oct4-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${build.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const org = '11111111-1111-4111-8111-111111111111';

async function fixture(page: Page, failExtraction = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = { extractions: 0, plans: [] as Record<string, unknown>[], executions: 0, sources: [] as Array<{ name: string; text?: string; image?: string }> };
  await page.addInitScript(() => {
    localStorage.setItem('sb-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh-test', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '22222222-2222-4222-8222-222222222222' } }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new Error('The source-only flow must not ask for the microphone'); } } });
  });
  await page.route('https://backend.manufeo.test/**', async route => route.fulfill({ json: route.request().url().includes('ensure_personal_organization') ? org : [] }));
  await page.route('https://sources.manufeo.test/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/api/ai/status')) return route.fulfill({ json: { groq: true } });
    if (url.endsWith('/pdf.worker.min.mjs')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')) });
    if (url.endsWith('/api/ai/quote-sources')) {
      state.extractions++; state.sources = route.request().postDataJSON().sources;
      if (failExtraction && state.extractions === 1) return route.fulfill({ status: 503, json: { error: 'Lecture indisponible. Réessayez.' } });
      return route.fulfill({ json: { observations: 'Client Dupont, peinture des plafonds. 100 m² à 23 euros HT, TVA 10 %.' } });
    }
    if (url.endsWith('/api/actions/plan')) {
      state.plans.push(route.request().postDataJSON());
      return route.fulfill({ json: { proposals: [{ id: 'quote-source-proposal', organization_id: org, intent_type: 'prepare_quote', status: 'ready', missing_fields: [], warnings: [], risk_level: 'review', payload: { customer_hint: 'Dupont', items: [{ label: 'Peinture des plafonds', quantity: 100, unit: 'm²', unit_price: 23, tax_rate: 10 }] } }] } });
    }
    if (url.endsWith('/api/actions/execute')) {
      state.executions++;
      expect(route.request().postDataJSON()).toMatchObject({ proposalIds: ['quote-source-proposal'], directCreation: false });
      return route.fulfill({ json: { results: [{ proposalId: 'quote-source-proposal', entityType: 'quote', entityId: 'saved-source-quote', intentType: 'prepare_quote', message: 'Devis enregistré.' }] } });
    }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://sources.manufeo.test/');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.getByRole('button', { name: /Photos ou documents/ }).click();
  await expect(page.getByRole('button', { name: 'Prendre une photo', exact: true })).toBeVisible();
  await expect(page.getByLabel('Photo du chantier')).toHaveAttribute('capture', 'environment');
  return { state, errors };
}

for (const kind of ['txt', 'photo', 'pdf'] as const) test(`devis depuis ${kind} : import mobile, lecture, brouillon à relire et sauvegarde`, async ({ page }) => {
  const { state, errors } = await fixture(page);
  const input = page.getByLabel('Documents du devis');
  if (kind === 'txt') {
    await input.setInputFiles({ name: 'metres.txt', mimeType: 'text/plain', buffer: Buffer.from('Client Dupont. Peinture plafond 100 m² à 23 euros HT. TVA 10 %.') });
  } else if (kind === 'photo') {
    await input.setInputFiles({ name: 'plafond.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==', 'base64') });
    await page.getByRole('textbox', { name: 'Demande à MANUFEO' }).fill('Client Dupont. Surface 100 m² à 23 euros HT. TVA 10 %.');
  } else {
    const pdf = new jsPDF(); pdf.text('Client Dupont. Peinture plafond 100 m2 a 23 euros HT. TVA 10%.', 15, 30);
    await input.setInputFiles({ name: 'metres.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer')) });
  }
  await expect(page.getByRole('button', { name: 'Préparer le devis avec mes sources', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Préparer le devis avec mes sources', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Valider et exécuter', exact: true })).toBeVisible();
  expect(state.executions).toBe(0);
  expect(state.extractions).toBe(1);
  expect(state.plans[0]).toMatchObject({ quoteSources: true, target: 'command' });
  expect(state.plans[0].transcript).toContain('100 m²');
  if (kind !== 'txt') expect(state.sources[0].image).toMatch(/^data:image\/jpeg;base64,/);
  if (kind === 'pdf') expect(state.sources[0].text).toContain('Client Dupont');
  await page.getByText('Informations lues dans les sources', { exact: true }).click();
  await expect(page.getByText('Client Dupont, peinture des plafonds. 100 m² à 23 euros HT, TVA 10 %.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Valider et exécuter', exact: true }).click();
  await expect(page.getByText('Devis enregistré.', { exact: true })).toBeVisible();
  expect(state.executions).toBe(1);
  expect(errors).toEqual([]);
});

test('import : retirer un fichier, rejeter un format invalide et réessayer après une panne sans perdre les sources', async ({ page }) => {
  const { state } = await fixture(page, true);
  const input = page.getByLabel('Documents du devis');
  await input.setInputFiles({ name: 'document.docx', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('status')).toContainText('Formats acceptés');
  await input.setInputFiles({ name: 'metres.txt', mimeType: 'text/plain', buffer: Buffer.from('Peinture des plafonds.') });
  await expect(page.getByRole('button', { name: 'Retirer metres.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer metres.txt' }).click();
  await expect(page.getByRole('button', { name: 'Préparer le devis avec mes sources' })).toHaveCount(0);
  await input.setInputFiles({ name: 'metres.txt', mimeType: 'text/plain', buffer: Buffer.from('Peinture des plafonds.') });
  await page.getByRole('button', { name: 'Préparer le devis avec mes sources' }).click();
  await expect(page.getByRole('status')).toContainText('Lecture indisponible');
  await expect(page.getByRole('button', { name: 'Retirer metres.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Préparer le devis avec mes sources' }).click();
  await expect(page.getByRole('button', { name: 'Valider et exécuter' })).toBeVisible();
  expect(state.extractions).toBe(2); expect(state.plans.length).toBe(1); expect(state.executions).toBe(0);
});


test('envoi mobile : autre destinataire et erreur visible sans couvrir le bouton ni le message',async({page})=>{
 const {errors}=await fixture(page);
 let sends=0;
 await page.route('https://sources.manufeo.test/api/email',async route=>{
  sends++;
  expect(route.request().postDataJSON()).toMatchObject({to:'autre@example.fr',customRecipient:true,documentKind:'invoice'});
  expect(route.request().headers().authorization).toBe('Bearer test-token');
  return route.fulfill({status:503,json:{error:'Service temporairement indisponible.'}});
 });
 await page.goto('https://sources.manufeo.test/email');
 await page.getByRole('textbox',{name:/^Destinataire/}).fill('autre@example.fr');
 await page.getByRole('button',{name:'Envoyer avec le PDF'}).click();
 const feedback=page.getByRole('status');
 await expect(feedback).toContainText('Service temporairement indisponible');
 await page.getByRole('button',{name:'Envoyer avec le PDF'}).scrollIntoViewIfNeeded();
 const warning=await feedback.boundingBox();
 const send=await page.getByRole('button',{name:'Envoyer avec le PDF'}).boundingBox();
 expect(warning!.y+warning!.height).toBeLessThan(send!.y);
 const textarea=page.getByRole('textbox',{name:'Message',exact:true});
 expect(await textarea.evaluate(element=>getComputedStyle(element).boxSizing)).toBe('border-box');
 expect(await textarea.evaluate(element=>getComputedStyle(element).paddingTop)).toBe('12px');
 expect(sends).toBe(1);expect(errors).toEqual([]);
 await page.screenshot({path:'tmp/philippe-email-mobile.png',fullPage:true});
});
