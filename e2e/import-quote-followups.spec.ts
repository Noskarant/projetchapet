import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const build=buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Assistant from './app/action-voice-assistant';import PdfPages from './app/pdf-pages';import {jsPDF} from 'jspdf';
const pdf=new jsPDF();pdf.text('Devis test',15,20);pdf.addPage();pdf.text('Suite',15,20);
createRoot(document.getElementById('root')).render(location.pathname==='/pdf'?<div style={{display:'flex',width:'100%',height:'500px'}}><PdfPages url={URL.createObjectURL(pdf.output('blob'))} title="Devis test"/></div>:<><button onClick={()=>window.dispatchEvent(new CustomEvent('projetchapet:open-ai',{detail:{target:'quote'}}))}>Créer avec IA</button><Assistant/></>);
`},bundle:true,write:false,outdir:'/tmp/import-followups',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'})},tsconfig:path.join(root,'tsconfig.json')});
const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${build.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(f=>f.path.endsWith('.js'))!.text.replace(/<\/script/giu,'<\\/script')}</script></body></html>`;
const org='11111111-1111-4111-8111-111111111111';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('sb-backend-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'refresh-test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'22222222-2222-4222-8222-222222222222'}})));
 await page.route('https://backend.manufeo.test/**',r=>r.fulfill({json:r.request().url().includes('ensure_personal_organization')?org:[]}));
 await page.route('https://followups.manufeo.test/**',r=>r.request().url().endsWith('/api/ai/status')?r.fulfill({json:{groq:false}}):r.request().url().endsWith('/pdf.worker.min.mjs')?r.fulfill({contentType:'text/javascript',body:readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))}):r.fulfill({contentType:'text/html',body:html}));
});
function review(){return {proposals:[{id:'q1',organization_id:org,intent_type:'prepare_quote',status:'needs_review',missing_fields:['customer_id'],warnings:[],risk_level:'review',payload:{items:[]}}]}}

test('dictée complémentaire : documents, texte, marge et consignes précédentes conservés',async({page})=>{
 const plans:Record<string,unknown>[]=[];let extracted=0;
 await page.route('https://followups.manufeo.test/api/ai/quote-sources',r=>{extracted++;return r.fulfill({json:{observations:'Volet 100 euros HT. Client Test.'}})});
 await page.route('https://followups.manufeo.test/api/actions/plan',r=>{plans.push(r.request().postDataJSON());return r.fulfill({json:review()})});
 await page.addInitScript(()=>{
  (window as any).spoken='Ajoute RSE 1 %.';
  class Recognition{lang='fr-FR';continuous=true;interimResults=false;onresult:any;onend:any;onerror:any;start(){}stop(){this.onresult?.({results:[[{transcript:(window as any).spoken}]]});this.onend?.()}}
  Object.assign(window,{SpeechRecognition:Recognition});
 });
 await page.goto('https://followups.manufeo.test/assistant');await page.getByRole('button',{name:'Créer avec IA',exact:true}).click();
 await page.getByRole('textbox',{name:'Demande à MANUFEO',exact:true}).fill('Client Test. Conserver la description du volet.');
 await page.getByRole('textbox',{name:'Texte copié',exact:true}).fill('Assuré Client Test. Coordonnées à conserver.');
 await page.getByRole('textbox',{name:'Majoration sur les prix HT (%)'}).fill('30');
 await page.getByLabel('Documents du devis',{exact:true}).setInputFiles({name:'devis.txt',mimeType:'text/plain',buffer:Buffer.from('Volet 100 euros HT.')});
 await expect(page.getByText('devis.txt',{exact:true})).toBeVisible();
 await page.getByTestId('voice-preview-button').click({position:{x:50,y:50}});
 await page.getByRole('button',{name:'J’ai fini de parler',exact:true}).click();
 await expect.poll(()=>plans.length).toBe(1);expect(plans[0].quoteSources).toBe(true);
 const first=String(plans[0].transcript);expect(first).toContain('Conserver la description du volet');expect(first).toContain('Ajoute RSE 1 %');expect(first).toContain('Majoration commerciale des prix HT : 30 %');expect(first).toContain('Coordonnées à conserver');expect(first).toContain('Volet 100 euros HT');
 await page.evaluate(()=>(window as any).spoken='Précise TVA 20 %.');
 await page.getByRole('button',{name:'Ajouter des consignes vocales',exact:true}).click();await page.getByRole('button',{name:'J’ai fini de parler',exact:true}).click();
 await expect.poll(()=>plans.length).toBe(2);expect(String(plans[1].transcript)).toContain('Ajoute RSE 1 %');expect(String(plans[1].transcript)).toContain('Précise TVA 20 %');expect(extracted).toBe(1);
 await expect(page.getByText('devis.txt',{exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Majoration sur les prix HT (%)'})).toHaveValue('30');
});

async function pcmMock(page:Page,deny=false,delayed=false){
 await page.route('https://followups.manufeo.test/api/ai/status',r=>r.fulfill({json:{groq:true}}));
 await page.addInitScript(({deny,delayed})=>{
  (window as any).micRequests=0;(window as any).stopped=0;
  const node=()=>({connect(){},disconnect(){}});
  class AudioContextMock{
   sampleRate=16000;destination={};resume(){return new Promise<void>(resolve=>(window as any).resumed=resolve)}
   createMediaStreamSource(){return node()}createScriptProcessor(){const n={...node(),onaudioprocess:null};(window as any).processor=n;return n}createGain(){return {...node(),gain:{value:0}}}close(){return Promise.resolve()}
  }
  Object.assign(window,{AudioContext:AudioContextMock});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{
   (window as any).micRequests++;(window as any).micActivation=navigator.userActivation?.isActive;
   if(deny){(window as any).resumed();return Promise.reject(new DOMException('Denied','NotAllowedError'))}
   const stream={getTracks:()=>[{stop:()=>{(window as any).stopped++}}]};
   if(delayed)return new Promise(resolve=>(window as any).grant=()=>{(window as any).resumed();resolve(stream)});
   (window as any).resumed();return Promise.resolve(stream);
  }}});
 },{deny,delayed});
}

test('Safari audio : demande du microphone dans le clic, reprise audio et consignes fusionnées',async({page})=>{
 await pcmMock(page);let planned='';
 await page.route('https://followups.manufeo.test/api/transcribe',r=>r.fulfill({json:{text:'Ajouter TVA 10 %.'}}));
 await page.route('https://followups.manufeo.test/api/actions/plan',r=>{planned=r.request().postDataJSON().transcript;return r.fulfill({json:review()})});
 await page.goto('https://followups.manufeo.test/assistant');await page.getByRole('button',{name:'Créer avec IA'}).click();await page.getByRole('textbox',{name:'Demande à MANUFEO',exact:true}).fill('Client Test. Volet 100 euros HT.');
 await page.getByRole('textbox',{name:'Texte copié',exact:true}).fill('Document fournisseur : volet 100 euros HT.');
 await page.getByRole('button',{name:'Ajouter des consignes vocales',exact:true}).click();await expect(page.getByTestId('voice-listening-visualizer')).toBeVisible();
 const state=await page.evaluate(()=>({requests:(window as any).micRequests,active:(window as any).micActivation}));expect(state.requests).toBe(1);if(state.active!==undefined)expect(state.active).toBe(true);
 await page.evaluate(()=>(window as any).processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(16000).fill(.02)}}));
 await page.getByRole('button',{name:'J’ai fini de parler',exact:true}).click();await expect.poll(()=>planned).toContain('Ajouter TVA 10 %');expect(planned).toContain('Client Test');
});

test('microphone refusé : consignes et source restent disponibles',async({page})=>{
 await pcmMock(page,true);await page.goto('https://followups.manufeo.test/assistant');await page.getByRole('button',{name:'Créer avec IA'}).click();
 await page.getByRole('textbox',{name:'Demande à MANUFEO',exact:true}).fill('Ne pas perdre cette consigne.');await page.getByRole('textbox',{name:'Texte copié',exact:true}).fill('Client Test.');
 await page.getByRole('button',{name:'Ajouter des consignes vocales',exact:true}).click();await expect(page.getByRole('textbox',{name:'Demande à MANUFEO',exact:true})).toHaveValue('Ne pas perdre cette consigne.');await expect(page.getByRole('textbox',{name:'Texte copié',exact:true})).toHaveValue('Client Test.');
});

test('fermeture pendant autorisation micro : capture tardive arrêtée, assistant fermé',async({page})=>{
 await pcmMock(page,false,true);await page.goto('https://followups.manufeo.test/assistant');await page.getByRole('button',{name:'Créer avec IA'}).click();await page.getByRole('button',{name:'Démarrer la dictée vocale',exact:true}).click();
 await expect(page.getByTestId('voice-starting-visualizer')).toBeVisible();await page.getByTestId('voice-starting-visualizer').getByRole('button',{name:'Fermer',exact:true}).click();await page.evaluate(()=>(window as any).grant());
 await expect.poll(()=>page.evaluate(()=>(window as any).stopped)).toBe(1);await expect(page.getByRole('dialog',{name:'Assistant vocal MANUFEO'})).toHaveCount(0);
});

test('aperçu PDF tablette : page entière centrée, retour à largeur sans cacher le titre',async({page})=>{
 await page.setViewportSize({width:1100,height:750});await page.goto('https://followups.manufeo.test/pdf');const viewer=page.locator('.manufeo-pdf-viewer');await expect(viewer).toHaveAttribute('data-pdf-ready','true');
 await page.getByRole('button',{name:'Afficher la page entière'}).click();
 const canvas=viewer.locator('canvas').first();const bounds=await canvas.boundingBox();const rootBounds=await viewer.boundingBox();
 expect(Math.abs(bounds!.x+bounds!.width/2-(rootBounds!.x+rootBounds!.width/2))).toBeLessThan(2);expect(bounds!.height).toBeLessThan(410);
 await page.getByRole('button',{name:'Agrandir le PDF'}).click();await page.getByRole('button',{name:'Adapter le PDF à l’écran'}).click();await expect(viewer).toHaveAttribute('data-pdf-scale','1.00');await expect.poll(()=>viewer.evaluate(el=>el.scrollTop)).toBe(0);
 await expect(viewer.locator('canvas')).toHaveCount(2);
});
