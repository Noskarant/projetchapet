import {test,expect} from '@playwright/test';
import {buildSync} from 'esbuild';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const root=process.cwd();
const bundle=buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Commercial from './app/mobile-commercial-demo';import Sms from './app/document-email-sms-notification';
import Signature from './app/signer/[token]/signature-client';
import {supabase} from './lib/supabase';
import {seedMobileWorkspace} from './lib/mobile-prototype';
import {seedCommercialDemoState,writeCommercialDemoState} from './lib/mobile-commercial-demo';
import {ensureQuotePhotoProject} from './lib/quote-photo-dossier';
const workspace=seedMobileWorkspace();workspace.quotes[0].status='En attente';workspace.quotes[0].customerId=workspace.customers[0].id;
workspace.customers[0].emails=['client@example.fr'];workspace.customers[0].phones=['0665789284'];
workspace.customers[0].address='28 rue Ferdinand Clavel';workspace.customers[0].postalCode='42100';workspace.customers[0].city='Saint-Etienne';
localStorage.setItem('projetchapet-mobile-workspace-v3',JSON.stringify(workspace));
const result=ensureQuotePhotoProject({...seedCommercialDemoState(),projects:[]},workspace.quotes[0],workspace.customers[0]);
result.project.photos=[{id:'photo-door',name:'Porte.png',caption:'Avant travaux',createdAt:'2026-10-08T08:00:00Z',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='}];
writeCommercialDemoState(localStorage,result.state);
supabase.auth.getSession=async()=>({data:{session:{access_token:'test-session'}},error:null});
createRoot(document.getElementById('root')).render(location.pathname==='/client'?<Signature token={'a'.repeat(64)}/>:<><button onClick={()=>window.dispatchEvent(new CustomEvent('manufeo:send-quote',{detail:{number:workspace.quotes[0].number,withoutPrices:false}}))}>Envoyer devis test</button><Commercial/><Sms/></>);
`},bundle:true,write:false,outdir:'/tmp/philippe-oct8',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED:'0',NEXT_PUBLIC_SUPABASE_URL:'https://backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'})},tsconfig:path.join(root,'tsconfig.json')});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text.replace(/<\/script/giu,'<\\/script')}</script></body></html>`;
test.beforeEach(async({page})=>{
 await page.route('https://backend.manufeo.test/**',r=>r.fulfill({json:[]}));
 await page.route('https://oct8.manufeo.test/**',r=>r.request().url().endsWith('/pdf.worker.min.mjs')?r.fulfill({contentType:'text/javascript',body:readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))}):r.fulfill({contentType:'text/html',body:html}));
});
test('devis : photos jointes, signature et notification au client dans le même envoi',async({page})=>{
 const sent:any[]=[];
 await page.route('**/api/email',async route=>{if(route.request().method()==='GET')return route.fulfill({json:{configured:true,smsConfigured:false}});sent.push(route.request().postDataJSON());return route.fulfill({json:{id:'email-test',sms:{status:'manual',phone:'+33665789284',message:'Votre devis a été envoyé par e-mail.'}}});});
 await page.goto('https://oct8.manufeo.test/email');await page.getByRole('button',{name:'Envoyer devis test'}).click();
 await expect(page.getByText('Porte.png',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Proposer la signature du devis',{exact:false})).toBeChecked();
 await page.getByRole('button',{name:'Envoyer avec le PDF'}).click();
 await expect.poll(()=>sent.length).toBe(1);
 expect(sent[0].requestSignature).toBe(true);expect(sent[0].notifyBySms).toBe(true);expect(sent[0].attachments).toHaveLength(2);
 expect(sent[0].attachments[1].filename).toMatch(/^dossier-photos-.*\.pdf$/);
 for(const attachment of sent[0].attachments)expect(Buffer.from(attachment.content,'base64').subarray(0,5).toString()).toBe('%PDF-');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(Buffer.from(sent[0].attachments[0].content,'base64'))});
 try{const pdf=await task.promise;const text=(await(await pdf.getPage(1)).getTextContent()).items.flatMap(i=>'str'in i?[i.str]:[]).join(' ');expect(text).toContain('28 rue Ferdinand Clavel');expect(text).toContain('42100 Saint-Etienne');}finally{await task.destroy()}
 await expect(page.getByRole('dialog',{name:'Prévenir le client par SMS'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Ouvrir Messages et envoyer le SMS'})).toHaveAttribute('href',/^sms:\+33665789284/);
});
test('gestion des photos : ouverture du dossier lié depuis l’envoi et retour au devis',async({page})=>{
 await page.route('**/api/email',r=>r.fulfill({json:{configured:true,smsConfigured:false}}));
 await page.goto('https://oct8.manufeo.test/email');await page.getByRole('button',{name:'Envoyer devis test'}).click();
 await page.getByRole('button',{name:'Ajouter / gérer les photos du devis'}).click();
 await expect(page.getByText('Choisir plusieurs photos',{exact:true})).toBeVisible();
 await page.getByLabel('Photos du chantier',{exact:true}).setInputFiles({name:'Après.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')});
 await expect(page.getByText('Photos ajoutées au chantier.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Envoyer le devis'})).toBeVisible();
 await expect(page.getByText('Porte.png',{exact:true})).toBeVisible();
 await expect(page.getByText('Après.png',{exact:true})).toBeVisible();
});
test('collaborateur : le devis sans prix garde les photos et retire signature et SMS client',async({page})=>{
 const sent:any[]=[];await page.route('**/api/email',route=>{if(route.request().method()==='GET')return route.fulfill({json:{configured:true,smsConfigured:false}});sent.push(route.request().postDataJSON());return route.fulfill({json:{id:'email-test'}})});
 await page.goto('https://oct8.manufeo.test/email');await page.getByRole('button',{name:'Envoyer devis test'}).click();
 await page.getByRole('textbox',{name:/^Destinataires/}).fill('collaborateur@example.fr');
 await page.getByLabel('Joindre la version chantier sans prix').check();
 await page.getByRole('button',{name:'Envoyer avec le PDF'}).click();await expect.poll(()=>sent.length).toBe(1);
 expect(sent[0].requestSignature).toBe(false);expect(sent[0].notifyBySms).toBe(false);expect(sent[0].attachments).toHaveLength(2);
 expect(sent[0].attachments[0].filename).toContain('sans-prix');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(Buffer.from(sent[0].attachments[0].content,'base64'))});
 try{const pdf=await task.promise;const content=(await(await pdf.getPage(1)).getTextContent()).items.flatMap(i=>'str'in i?[i.str]:[]).join(' ');expect(content).toContain('DOCUMENT CHANTIER SANS PRIX');expect(content).not.toContain('TOTAL TTC');}finally{await task.destroy()}
});
test('client : consultation sans compte, consentement obligatoire et preuve téléchargeable',async({page})=>{
 let signed=false;const accepted:any[]=[];
 await page.route('**/api/signatures/public**',route=>{if(route.request().method()==='POST'){accepted.push(route.request().postDataJSON());signed=true;return route.fulfill({json:{signed:true}})}if(new URL(route.request().url()).searchParams.has('format'))return route.fulfill({status:503,body:'PDF fixture unavailable'});return route.fulfill({json:{number:'DEV-2026-028',status:signed?'signed':'ready',expiresAt:'2026-11-08',signature:signed?{signer_name:'Bernard Lombard',signed_at:'2026-10-08T08:00:00Z'}:null}})});
 await page.goto('https://oct8.manufeo.test/client');
 await expect(page.getByRole('heading',{name:'Devis DEV-2026-028'})).toBeVisible();
 const button=page.getByRole('button',{name:'Signer et donner mon bon pour accord'});await expect(button).toBeDisabled();
 await page.getByLabel('Votre nom et prénom').fill('Bernard Lombard');await expect(button).toBeDisabled();await page.getByRole('checkbox').check();await button.click();
 await expect(page.getByText('Bon pour accord enregistré',{exact:true})).toBeVisible();expect(accepted).toHaveLength(1);expect(accepted[0].consent).toBe(true);
 await expect(page.getByRole('link',{name:'Télécharger la preuve d’accord'})).toHaveAttribute('href',/format=receipt$/);
});
