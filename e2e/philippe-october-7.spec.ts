import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundle = buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import PdfPages from './app/pdf-pages';import Assistant from './app/action-voice-assistant';
import SmsShare from './app/document-sms-share';import AutoPreview from './app/mobile-auto-pdf-preview';
import {FilterPanel} from './app/mobile-commercial-panels';import {seedMobileWorkspace} from './lib/mobile-prototype';import {jsPDF} from 'jspdf';
const workspace=seedMobileWorkspace();localStorage.setItem('projetchapet-mobile-workspace-v3',JSON.stringify(workspace));
const pdf=new jsPDF();pdf.text('Client Dupont. Plafond 100 m2 a 23 euros HT. TVA : 10 %.',15,30);pdf.addPage();pdf.text('Deuxieme page TVA : 10 %.',15,30);
const url=URL.createObjectURL(pdf.output('blob'));
const mode=location.pathname;
createRoot(document.getElementById('root')).render(mode==='/pdf'?<div style={{height:'100dvh',display:'flex'}}><PdfPages url={url} title="Devis test"/></div>:mode==='/sms'?<><button onClick={()=>window.dispatchEvent(new CustomEvent('manufeo:share-document-sms',{detail:{number:workspace.quotes[0].number,kind:'quote'}}))}>Partager le devis</button><SmsShare/></>:mode==='/filters'?<FilterPanel workspace={workspace} kind="quote" draft={{customerId:'',status:'',dateFrom:'',dateTo:'',minAmount:'',maxAmount:''}} onChange={()=>{}} onApply={()=>{}} onReset={()=>{}}/>:mode==='/editor'?<><section className="rm-v2-editor"><h2>Modifier le devis</h2><div className="rm-form-stack"><label>Numéro<input defaultValue={workspace.quotes[0].number}/></label><label>Notes<textarea/></label></div></section><AutoPreview/></>:<><button onClick={()=>window.dispatchEvent(new CustomEvent('projetchapet:open-ai',{detail:{target:'quote'}}))}>Créer avec IA</button><Assistant/></>);
`},bundle:true,write:false,outdir:'/tmp/philippe-oct7-bundle',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'})},tsconfig:path.join(root,'tsconfig.json')});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${bundle.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n')}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file=>file.path.endsWith('.js'))!.text.replace(/<\/script/giu,'<\\/script')}</script></body></html>`;
const org='11111111-1111-4111-8111-111111111111';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sb-backend-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'refresh-test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'22222222-2222-4222-8222-222222222222'}})));
  await page.route('https://backend.manufeo.test/**',route=>route.fulfill({json:route.request().url().includes('ensure_personal_organization')?org:[]}));
  await page.route('https://oct7.manufeo.test/**',route=>route.request().url().endsWith('/pdf.worker.min.mjs')?route.fulfill({contentType:'text/javascript',body:readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))}):route.fulfill({contentType:'text/html',body:html}));
});

test('PDF : pincement sous 100 %, page entière et deux pages conservées',async({page})=>{
  await page.setViewportSize({width:820,height:650});await page.goto('https://oct7.manufeo.test/pdf');
  const viewer=page.locator('.manufeo-pdf-viewer');await expect(viewer.locator('canvas')).toHaveCount(2);
  await viewer.evaluate(node=>{const dispatch=(type:string,x:number[])=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:x.map(clientX=>({clientX,clientY:200}))});node.dispatchEvent(event)};dispatch('touchstart',[100,300]);dispatch('touchmove',[150,250]);dispatch('touchend',[])});
  await expect(viewer).toHaveAttribute('data-pdf-scale','0.50');
  await viewer.getByRole('button',{name:'Afficher la page entière',exact:true}).click();
  await expect.poll(()=>viewer.locator('canvas').first().evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(550);
  await viewer.getByRole('button',{name:'Adapter le PDF à l’écran',exact:true}).click();await expect(viewer).toHaveAttribute('data-pdf-scale','1.00');
});

test('import PDF : lecteur Safari sans itérateur asynchrone, texte et deux pages préservés',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(ReadableStream.prototype,Symbol.asyncIterator,{configurable:true,value:undefined}));
  await page.goto('https://oct7.manufeo.test/sources');await page.getByRole('button',{name:'Créer avec IA',exact:true}).click();
  const {jsPDF}=await import('jspdf');const pdf=new jsPDF();pdf.text('TVA : 10 %',15,30);pdf.addPage();pdf.text('Seconde page',15,30);
  await page.locator('input[aria-label="Documents du devis"]').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf.output('arraybuffer'))});
  await expect(page.getByText('source.pdf · page 1',{exact:true})).toBeVisible();await expect(page.getByText('source.pdf · page 2',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Préparer le devis avec mes sources',exact:true})).toBeEnabled();
});

test('collage sans permission : champ accessible, repli français et génération disponible',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
  await page.goto('https://oct7.manufeo.test/sources');await page.getByRole('button',{name:'Créer avec IA',exact:true}).click();
  await page.getByRole('button',{name:'Coller le texte copié',exact:true}).click();await expect(page.getByText(/Appuyez longtemps/)).toBeVisible();
  await page.getByRole('textbox',{name:'Texte copié',exact:true}).fill('Client Dupont, plafond 20 m2 à 30 euros HT. TVA : 10 %.');
  await expect(page.getByRole('button',{name:'Préparer le devis avec mes sources',exact:true})).toBeEnabled();
});

test('consignes équipe : champ séparé et sauvegarde locale conservant les notes privées',async({page})=>{
  await page.goto('https://oct7.manufeo.test/editor');
  await page.getByLabel('Informations internes',{exact:false}).fill('Marge privée');
  await page.getByLabel('Consignes pour les collaborateurs',{exact:false}).fill('Prévoir deux jours et deux personnes');
  const meta=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('projetchapet-mobile-quote-meta-v1')||'{}'))[0]);
  expect(meta).toMatchObject({internalNotes:'Marge privée',teamInstructions:'Prévoir deux jours et deux personnes'});
});

test('SMS : PDF préparé, téléphone client et lien valant sept jours dans Messages',async({page})=>{
  await page.route('https://oct7.manufeo.test/api/documents/share',route=>{expect(route.request().postDataJSON()).toMatchObject({organizationId:org,kind:'quote'});expect(route.request().postDataJSON().content).toMatch(/^JVBER/);return route.fulfill({json:{url:'https://signed.manufeo.test/document.pdf?token=abc',phone:'0612345678',expiresInDays:7}})});
  await page.goto('https://oct7.manufeo.test/sms');await page.getByRole('button',{name:'Partager le devis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Partager par SMS',exact:true});await expect(dialog.getByLabel('Téléphone du client')).toHaveValue('0612345678');
  await expect(dialog.getByLabel('Message SMS',{exact:true})).toHaveValue(/https:\/\/signed.manufeo.test\/document.pdf\?token=abc/);
  await expect(dialog.getByRole('link',{name:'Ouvrir Messages'})).toHaveAttribute('href',/^sms:0612345678[?&]body=Bonjour/);
});


test('impression : toutes les pages A4, sans aperçu ni zoom, et nettoyage après impression', async ({ page, browserName }, testInfo) => {
  await page.goto('https://oct7.manufeo.test/pdf');
  const viewer = page.locator('.manufeo-pdf-viewer');
  await expect(viewer).toHaveAttribute('data-pdf-ready', 'true');
  await viewer.getByRole('button', { name: 'Afficher la page entière' }).click();
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); }; });
  await page.getByRole('button', { name: 'Imprimer', exact: true }).click();
  await expect(page.locator('#manufeo-print-document canvas')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  const size = await page.locator('.manufeo-print-page').first().boundingBox();
  expect(size!.width).toBeCloseTo(210 * 96 / 25.4, 0);
  expect(size!.height).toBeCloseTo(297 * 96 / 25.4, 0);
  if (browserName === 'chromium') {
    const bytes = await page.pdf({ path: testInfo.outputPath('impression-a4.pdf'), preferCSSPageSize: true, displayHeaderFooter: false });
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(bytes) });
    try { expect((await task.promise).numPages).toBe(2); } finally { await task.destroy(); }
  }
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#manufeo-print-document')).toHaveCount(0);
  await expect(viewer).toBeVisible();
});

test('SMS : le lien reste présent après réécriture, version sans prix et destinataire libre', async ({ page }) => {
  let noPrices = false;
  await page.route('https://oct7.manufeo.test/api/documents/share', async route => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(Buffer.from(route.request().postDataJSON().content, 'base64')) });
    try {
      const pdf = await task.promise; let text = '';
      for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.flatMap(item => 'str' in item ? [item.str] : []).join(' ');
      noPrices = text.includes('DOCUMENT CHANTIER SANS PRIX');
    } finally { await task.destroy(); }
    await route.fulfill({ json: { url: 'https://signed.manufeo.test/document.pdf?token=abc', phone: '0612345678' } });
  });
  await page.goto('https://oct7.manufeo.test/sms');
  await page.getByRole('button', { name: 'Partager le devis', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Partager par SMS', exact: true });
  await expect(dialog.getByLabel('Message SMS', { exact: true })).toHaveValue(/https:/);
  await dialog.getByLabel('Version du PDF').selectOption('without');
  await expect(dialog.getByLabel('Message SMS', { exact: true })).toHaveValue(/https:/);
  expect(noPrices).toBe(true);
  await dialog.getByLabel('Message SMS', { exact: true }).fill('Bonjour, voici votre devis.');
  await dialog.getByRole('button', { name: 'Autre destinataire' }).click();
  const href = await dialog.getByRole('link', { name: 'Ouvrir Messages' }).getAttribute('href');
  expect(decodeURIComponent(href!)).toContain('Bonjour, voici votre devis.');
  expect(decodeURIComponent(href!)).toContain('https://signed.manufeo.test/document.pdf?token=abc');
  expect(href).toMatch(/^sms:[?&]body=/);
});

test('correction IA : ajout de fichiers et collage texte conservés dans la nouvelle analyse', async ({ page }) => {
  let lastPlan: Record<string, unknown> = {}, sourceCount = 0;
  await page.route('https://oct7.manufeo.test/api/ai/quote-sources', async route => {
    sourceCount = route.request().postDataJSON().sources.length;
    await route.fulfill({ json: { observations: 'Plafond 20 m2 à 30 euros HT. TVA 10 %.' } });
  });
  await page.route('https://oct7.manufeo.test/api/actions/plan', async route => {
    lastPlan = route.request().postDataJSON();
    await route.fulfill({ json: { proposals: [{ id: 'q1', organization_id: org, intent_type: 'prepare_quote', status: 'needs_review', missing_fields: ['customer_id'], warnings: [], risk_level: 'review', payload: { items: [] } }] } });
  });
  await page.goto('https://oct7.manufeo.test/sources');
  await page.getByRole('button', { name: 'Créer avec IA', exact: true }).click();
  await page.getByLabel('Texte copié', { exact: true }).fill('Plafond 20 m2 à 30 euros HT.');
  await page.getByRole('button', { name: 'Préparer le devis avec mes sources', exact: true }).click();
  await expect(page.getByText('Corriger la dictée', { exact: true })).toBeVisible();
  await page.getByLabel('Documents du devis').setInputFiles({ name: 'complement.txt', mimeType: 'text/plain', buffer: Buffer.from('Client Dupont, TVA 10 %.') });
  await expect(page.getByText('complement.txt', { exact: true })).toBeVisible();
  await page.locator('#ava-correction').evaluate(node => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKp8AAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], 'capture.png', { type: 'image/png' }));
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    node.dispatchEvent(event);
  });
  await expect(page.getByText('capture.png', { exact: true })).toBeVisible();
  await page.getByLabel('Texte copié', { exact: true }).fill('Client Dupont, plafond 20 m2 à 30 euros HT.');
  await page.getByRole('button', { name: 'Relancer l’analyse', exact: true }).click();
  await expect.poll(() => sourceCount).toBe(2);
  await expect.poll(() => lastPlan.transcript).toContain('Client Dupont');
  expect(lastPlan.quoteSources).toBe(true);
});
