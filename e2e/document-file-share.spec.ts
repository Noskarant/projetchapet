import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundle = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import AutoPreview from './app/mobile-auto-pdf-preview';
import UnifiedSheet from './app/mobile-unified-quote-sheet';
import ActionsMenu from './app/mobile-philippe-quote-actions-menu';
import {seedMobileWorkspace,convertQuoteToInvoice} from './lib/mobile-prototype';
import {buildBusinessDocumentPdf} from './lib/mobile-document-pdf';
import {sharePreparedPdf} from './lib/document-file-share';
let workspace=seedMobileWorkspace();
if(location.search.includes('completed')){workspace.quotes[0].status='Terminé';workspace.invoices=[];}
if(location.search.includes('linked')) workspace=convertQuoteToInvoice(workspace,workspace.quotes[0]).workspace;
localStorage.setItem('projetchapet-mobile-workspace-v3',JSON.stringify(workspace));
const kind=location.search.includes('invoice')?'invoice':'quote';
const withoutPrices=location.search.includes('without');
const doc=(kind==='quote'?workspace.quotes:workspace.invoices)[0];
function FileHarness(){const [blob,setBlob]=React.useState(null);React.useEffect(()=>{buildBusinessDocumentPdf({document:doc,customer:workspace.customers.find(c=>c.id===doc.customerId),company:{},withoutPrices}).then(setBlob)},[]);return <button disabled={!blob} onClick={()=>void sharePreparedPdf(blob,doc.number+(withoutPrices?'-sans-prix':'')+'.pdf')}>Partager / Fichiers</button>}
createRoot(document.getElementById('root')).render(location.pathname==='/menu'?<><button onClick={()=>window.dispatchEvent(new CustomEvent('manufeo:open-created-quote',{detail:{quote:workspace.quotes[0],customer:workspace.customers[0]}}))}>Afficher le devis</button><AutoPreview/><UnifiedSheet/><ActionsMenu/></>:<FileHarness/>);
` }, bundle: true, write: false, outdir: '/tmp/file-share-bundle', jsx: 'automatic', minify: true,
 define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'}) }, tsconfig: path.join(root,'tsconfig.json') });
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text.replace(/<\/script/giu,'<\\/script')}</script></body></html>`;

test.beforeEach(async({page})=>{
 await page.route('https://backend.manufeo.test/**',r=>r.fulfill({json:[]}));
 await page.route('https://files.manufeo.test/**',r=>r.request().url().endsWith('/pdf.worker.min.mjs')?r.fulfill({contentType:'text/javascript',body:readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))}):r.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(()=>{
  (window as any).shares=[]; (window as any).smsEvents=0;
  (window as any).invoiceRequests=[];
  window.addEventListener('manufeo:convert-quote-to-invoice',event=>{(window as any).invoiceRequests.push((event as CustomEvent).detail)});
  window.addEventListener('manufeo:share-document-sms',()=>{(window as any).smsEvents++});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:(data:ShareData)=>{
   // Snapshot activation before reading bytes: the share call must stay inside the click.
   const active=navigator.userActivation?.isActive;
   return Promise.all(data.files!.map(async file=>({name:file.name,type:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))}))).then(files=>{(window as any).shares.push({files,active,hasUrl:'url'in data,hasText:'text'in data,hasTitle:'title'in data})});
  }});
 });
});

test('devis terminé : création de facture proposée même sans fiche sous-jacente',async({page})=>{
 await page.goto('https://files.manufeo.test/menu?completed');
 await page.getByRole('button',{name:'Afficher le devis'}).click();
 await expect(page.getByRole('button',{name:'Créer la facture',exact:true})).toBeVisible();
 const number=await page.locator('.rm-philippe-preview-header h2').textContent();
 await page.getByRole('button',{name:'Créer la facture',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).invoiceRequests)).toEqual([number]);
 await expect(page.locator('.rm-philippe-preview')).toHaveCount(0);
});

test('devis déjà facturé : le bouton propose de rouvrir la facture',async({page})=>{
 await page.goto('https://files.manufeo.test/menu?completed&linked');
 await page.getByRole('button',{name:'Afficher le devis'}).click();
 await expect(page.getByRole('button',{name:'Ouvrir la facture',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Créer la facture',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Ouvrir la facture',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).invoiceRequests.length)).toBe(1);
});

for(const kind of ['quote','invoice']) for(const without of [false,true]) test(`${kind} ${without?'sans prix':'avec prix'} : fichier PDF nommé, aucune URL, clic conservé`,async({page})=>{
 await page.goto(`https://files.manufeo.test/file?${kind}${without?'&without':''}`);
 const button=page.getByRole('button',{name:'Partager / Fichiers'}); await expect(button).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).shares.length)).toBe(0);
 await button.click(); await expect.poll(()=>page.evaluate(()=>(window as any).shares.length)).toBe(1);
 const share=await page.evaluate(()=>(window as any).shares[0]);
 expect(share.files).toHaveLength(1); expect(share.hasUrl).toBe(false); expect(share.hasText).toBe(false); expect(share.hasTitle).toBe(false);
 await button.click(); await expect.poll(()=>page.evaluate(()=>(window as any).shares.length)).toBe(2);
 expect(await page.evaluate(()=>(window as any).shares[1].files[0].name)).toBe(share.files[0].name);
 if(share.active!==undefined) expect(share.active).toBe(true);
 const file=share.files[0]; expect(file.name).toMatch(without?/-sans-prix\.pdf$/:/(?<!-sans-prix)\.pdf$/); expect(file.type).toBe('application/pdf');
 expect(Buffer.from(file.bytes).subarray(0,4).toString()).toBe('%PDF');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(file.bytes)});
 try {const pdf=await task.promise;const text=(await(await pdf.getPage(1)).getTextContent()).items.flatMap(i=>'str'in i?[i.str]:[]).join(' ');expect(text.includes('DOCUMENT CHANTIER SANS PRIX')).toBe(without);expect(text).toContain(kind==='invoice'?'FACTURE':'DEVIS');}finally{await task.destroy()}
});

test('menu devis : Partager ouvre le fichier, SMS reste une action séparée',async({page})=>{
 await page.goto('https://files.manufeo.test/menu');await page.getByRole('button',{name:'Afficher le devis'}).click();
 await page.getByRole('button',{name:'Actions du devis',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'Actions du devis',exact:true});await expect(menu.getByRole('button',{name:'Partager le devis',exact:true})).toBeEnabled();
 await menu.getByRole('button',{name:'Partager le devis',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).shares.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).smsEvents)).toBe(0);
 await page.getByRole('button',{name:'Actions du devis',exact:true}).click();await menu.getByRole('button',{name:'Partager par SMS',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).smsEvents)).toBe(1);
});

test('partage annulé : aucun téléchargement, aucune erreur',async({page})=>{
 let downloads=0,dialogs=0;page.on('download',()=>downloads++);page.on('dialog',async d=>{dialogs++;await d.dismiss()});
 await page.goto('https://files.manufeo.test/file');await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('Cancelled','AbortError'))}));
 const button=page.getByRole('button',{name:'Partager / Fichiers'});await expect(button).toBeEnabled();await button.click();await expect(button).toBeEnabled();
 expect(downloads).toBe(0);expect(dialogs).toBe(0);
});

test('fichiers non pris en charge : téléchargement PDF, aucun partage de lien',async({page})=>{
 await page.goto('https://files.manufeo.test/file?invoice&without');await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
 const button=page.getByRole('button',{name:'Partager / Fichiers'});await expect(button).toBeEnabled();
 const download=page.waitForEvent('download');await button.click();expect((await download).suggestedFilename()).toMatch(/-sans-prix\.pdf$/);
 expect(await page.evaluate(()=>(window as any).shares.length)).toBe(0);
});
