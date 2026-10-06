import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { normalizeModelPlan } from '../lib/action-planner';

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
import Projects from './app/mobile-commercial-projects';
import AutoPreview from './app/mobile-auto-pdf-preview';
import './app/mobile-quote-preview.css';
import {normalizeModelPlan} from './lib/action-planner';
import {calculateTotals} from './lib/mobile-prototype';
import {seedCommercialDemoState,readCommercialDemoState,writeCommercialDemoState} from './lib/mobile-commercial-demo';
import {buildProjectPhotoReport} from './lib/project-photo-report';
import {sendProjectPhotoEmail} from './lib/project-photo-email';
import {blobToBase64} from './lib/document-tools';
function EmailHarness(){
 const [draft,setDraft]=React.useState({document:seedMobileWorkspace().invoices[0],recipient:'client@example.fr',subject:'Votre facture',message:'Bonjour,\\n\\nVeuillez trouver votre facture.\\n\\nCordialement',withoutPrices:false});
 const [message,setMessage]=React.useState('');
 return <div className="rm-commercial-backdrop"><section className="rm-commercial-panel"><EmailPanel draft={draft} busy={false} message={message} onChange={setDraft} onSend={()=>void sendAuthenticatedDocumentEmail({documentNumber:draft.document.number,documentKind:'invoice',to:draft.recipient,customRecipient:true,attachments:[{filename:'facture.pdf',content:'JVBERi0xLjc='}]}).then(()=>setMessage('Envoyé.')).catch(error=>setMessage(error.message))} onCancel={()=>{}}/></section></div>;
}
function ProjectsHarness(){
 const [state,setState]=React.useState(()=>{const stored=readCommercialDemoState(localStorage);return stored.projects.length?stored:{...seedCommercialDemoState(),projects:['P-1','P-2'].map(id=>({id,name:id==='P-1'?'Salle de bain Bonnand':'Autre chantier',subtitle:'Peinture',customerId:'C-1',address:'8 rue de la République',status:'En cours',startDate:'',nextVisit:'',teamIds:[],steps:[],issues:[],photos:[]}))}});
 const [selected,setSelected]=React.useState('P-1');
 return <div className="rm-commercial-backdrop"><section className="rm-commercial-panel"><Projects state={state} selectedProjectId={selected} onSelectProject={setSelected} customerEmail={selected==='P-1'?'client@example.fr':'autre-client@example.fr'} onChange={next=>{writeCommercialDemoState(localStorage,next);setState(next)}} onNotify={()=>{}} onDownloadDocument={()=>{}} onCreateQuote={()=>{}} onSendPhotoReport={async(project,ids,to)=>{const blob=await buildProjectPhotoReport(project,ids,'CHAPET','Cécile Bonnand','0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');await sendProjectPhotoEmail(project.id,ids,to,await blobToBase64(blob),'test-report-request')}}/></section></div>;
}
function FranchiseHarness(){
 const workspace=React.useMemo(()=>{const state=seedMobileWorkspace();const phrase=location.search.includes('ht')?'Franchise 125 euros HT.':'Franchise à récupérer 125 euros TTC.';const action=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Client Test',items:[{label:'Peinture murs',quantity:100,unit:'m²',unit_price:23,tax_rate:10}]}}]},'Peinture murs 100 m² à 23 euros HT. TVA 10 %. '+phrase)[0];const items=action.payload.items.map((item,index)=>({id:String(index),label:item.label,description:item.description||'',quantity:item.quantity,unit:item.unit,unitPrice:item.unit_price,taxRate:item.tax_rate}));state.quotes=[{...state.quotes[0],items,notes:action.payload.notes||'',...calculateTotals(items)}];localStorage.setItem('projetchapet-mobile-workspace-v3',JSON.stringify(state));localStorage.setItem('projetchapet-mobile-quote-meta-v1',JSON.stringify({[state.quotes[0].number]:{discountPercent:0,internalNotes:''}}));return state},[]);
 return <><button onClick={()=>window.dispatchEvent(new CustomEvent('manufeo:open-created-quote',{detail:{quote:workspace.quotes[0],customer:workspace.customers[0]}}))}>Afficher le devis</button><AutoPreview/></>;
}
createRoot(document.getElementById('root')).render(window.location.pathname==='/email'?<EmailHarness/>:window.location.pathname==='/projects'?<ProjectsHarness/>:window.location.pathname==='/franchise'?<FranchiseHarness/>:<><Shell/><Assistant/></>);
` }, bundle: true, write: false, outdir: '/tmp/philippe-oct4-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') });
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${build.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${build.outputFiles.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const org = '11111111-1111-4111-8111-111111111111';

for (const kind of ['ht','ttc'] as const) test(`franchise ${kind} : poste négatif distinct, totaux corrigés et PDF mobile lisible`,async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://backend.manufeo.test/**',route=>route.fulfill({json:[]}));
  await page.route('https://sources.manufeo.test/**',route=>route.request().url().endsWith('/pdf.worker.min.mjs')?route.fulfill({contentType:'text/javascript',body:readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'))}):route.fulfill({contentType:'text/html',body:html}));
  await page.goto(`https://sources.manufeo.test/franchise?${kind}`);
  await page.getByRole('button',{name:'Afficher le devis'}).click();
  const preview=page.locator('.rm-philippe-preview-backdrop');
  await expect(preview).toBeVisible();
  const franchise=preview.locator('.rm-philippe-line-card').filter({hasText:'Franchise à déduire'});
  await expect(franchise).toContainText(kind==='ttc'?'-113,64':'-125,00');
  const totals=preview.locator('.rm-philippe-totals');
  await expect(totals).toContainText(kind==='ttc'?'2 405,00':'2 392,50');
  await expect(totals).not.toContainText('Montant après franchise');
  await expect(totals).not.toContainText('Part client');
  await page.screenshot({animations: 'disabled',path:testInfo.outputPath('franchise.png')});
  await preview.getByRole('button',{name:'Page complète',exact:true}).click();
  await expect(preview.locator('canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

async function fixture(page: Page, failExtraction = false, customer = false) {
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
      return route.fulfill({ json: { observations: customer ? 'DEGAND Lucie PACIFICA. 56 rue du onze novembre, 42100 Saint-Étienne. 0633383203 et 0477370265. Lucie.degand@orange.fr. Rendez-vous le 8 octobre à 8h30.' : 'Client Dupont, peinture des plafonds. 100 m² à 23 euros HT, TVA 10 %.' } });
    }
    if (url.endsWith('/api/actions/plan')) {
      state.plans.push(route.request().postDataJSON());
      return route.fulfill({ json: { proposals: [{ id: 'quote-source-proposal', organization_id: org, intent_type: customer ? 'create_customer' : 'prepare_quote', status: 'ready', missing_fields: [], warnings: [], risk_level: 'review', payload: customer ? { kind:'individual',last_name:'DEGAND',first_name:'Lucie',phones:['0633383203','0477370265'],emails:['lucie.degand@orange.fr'],addresses:[{line1:'56 rue du onze novembre',postal_code:'42100',city:'Saint-Étienne'}],notes:'Assurance PACIFICA. Rendez-vous le 8 octobre à 8h30.' } : { customer_hint: 'Dupont', items: [{ label: 'Peinture des plafonds', quantity: 100, unit: 'm²', unit_price: 23, tax_rate: 10 }] } }] } });
    }
    if (url.endsWith('/api/actions/execute')) {
      state.executions++;
      expect(route.request().postDataJSON()).toMatchObject({ proposalIds: ['quote-source-proposal'], directCreation: false });
      return route.fulfill({ json: { results: [{ proposalId: 'quote-source-proposal', entityType: customer ? 'customer' : 'quote', entityId: 'saved-source-quote', intentType: customer ? 'create_customer' : 'prepare_quote', message: customer ? 'Client enregistré.' : 'Devis enregistré.' }] } });
    }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://sources.manufeo.test/');
  if (customer) {
    await page.getByRole('button', { name: 'Clients', exact: true }).click();
    await page.getByRole('button', { name: 'Note ou photo → client', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await page.getByRole('button', { name: /Photos ou documents/ }).click();
  }
  await expect(page.getByRole('button', { name: 'Prendre une photo', exact: true })).toBeVisible();
  await expect(page.getByLabel(customer ? 'Photo du client' : 'Photo du chantier')).toHaveAttribute('capture', 'environment');
  return { state, errors };
}

for (const customer of [false, true]) for (const clipboard of ['autorisé', 'refusé'] as const) test(`copier-coller un mail vers ${customer ? 'client' : 'devis'}, presse-papiers ${clipboard} : préparation sans microphone ni vision`, async ({ page }, testInfo) => {
  const { state, errors } = await fixture(page, false, customer);
  const text = 'Mme PIN Anne\npin@example.fr\nNuméro de dossier : F260361820H\nRéférence mission : R2600100705';
  await page.evaluate(({ text, clipboard }) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => {
      if (clipboard === 'refusé') throw new DOMException('Denied', 'NotAllowedError');
      return text;
    } } });
  }, { text, clipboard });
  await page.getByRole('button', { name: 'Coller le texte copié', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Texte copié', exact: true });
  if (clipboard === 'refusé') {
    await expect(page.getByRole('status')).toContainText('Appuyez longtemps');
    await expect(field).toBeFocused();
    await field.fill(text);
  }
  await expect(field).toHaveValue(text);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('text-paste.png'), fullPage: true });
  await page.getByRole('button', { name: customer ? 'Lire et préparer le client' : 'Préparer le devis avec mes sources', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Valider et exécuter', exact: true })).toBeVisible();
  expect(state.plans[0].transcript).toContain(text);
  expect(state.plans[0].sourceTarget).toBe(customer ? 'customer' : 'quote');
  expect(state.extractions).toBe(0); expect(state.executions).toBe(0); expect(errors).toEqual([]);
});

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

for (const mode of ['champ','dictée','photo','sans majoration'] as const) test(`devis fournisseur importé, majoration ${mode} : vrais prix calculés, validation avant sauvegarde`,async({page},testInfo)=>{
  const {state,errors}=await fixture(page);
  await page.route('https://sources.manufeo.test/api/actions/plan',async route=>{
    const request=route.request().postDataJSON();state.plans.push(request);
    const action=normalizeModelPlan({actions:[{intent_type:'prepare_quote',payload:{customer_hint:'Client Test',items:[{label:'Réalisation et pose de cloison inox',quantity:1,unit:'forfait',unit_price:4259.3,price_evidence:'4 259,30 euros HT',tax_evidence:'TVA 20 %'}]}}]},request.transcript)[0];
    await route.fulfill({json:{proposals:[{id:'quote-source-proposal',organization_id:org,intent_type:action.intentType,payload:action.payload,status:action.status,missing_fields:action.missingFields,warnings:action.warnings,risk_level:'review'}]}});
  });
  const pasted='Réalisation et pose d’une cloison inox. 1 forfait à 4 259,30 euros HT. TVA 20 %. Total TTC 5 111,16 euros. Délai environ 1 mois.';
  if(mode==='photo'){
    await page.route('https://sources.manufeo.test/api/ai/quote-sources',route=>{state.extractions++;state.sources=route.request().postDataJSON().sources;return route.fulfill({json:{observations:pasted}})});
    await page.getByLabel('Documents du devis').setInputFiles({name:'devis-fournisseur.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==','base64')});
  }else{
    await page.getByRole('textbox',{name:'Texte copié',exact:true}).fill(pasted);
  }
  await page.getByRole('textbox',{name:'Demande à MANUFEO',exact:true}).fill(`Client Test. Reprendre les prestations.${mode==='dictée'?' Ajoute trente pour cent de marge.':''}`);
  if(mode==='champ'||mode==='photo')await page.getByRole('textbox',{name:'Majoration sur les prix HT (%)',exact:true}).fill('30');
  await page.screenshot({animations: 'disabled',path:testInfo.outputPath('supplier-import.png'),fullPage:true});
  await page.getByRole('button',{name:'Préparer le devis avec mes sources',exact:true}).click();
  await expect(page.getByRole('button',{name:'Valider et exécuter',exact:true})).toBeVisible();
  await expect(page.locator('.ava-action-main').first()).toContainText(mode==='sans majoration'?'4 259,30':'5 537,09');
  expect(state.extractions).toBe(mode==='photo'?1:0);expect(state.executions).toBe(0);
  if(mode==='photo')expect(state.sources[0].image).toMatch(/^data:image\/jpeg;base64,/);
  expect(state.plans[0]).toMatchObject({quoteSources:true,sourceTarget:'quote'});
  expect(state.plans[0].transcript).toContain(pasted);
  await page.getByRole('button',{name:'Valider et exécuter',exact:true}).click();
  await expect(page.getByText('Devis enregistré.',{exact:true})).toBeVisible();expect(state.executions).toBe(1);expect(errors).toEqual([]);
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
 await page.screenshot({animations: 'disabled',path:'tmp/philippe-email-mobile.png',fullPage:true});
});


for (const kind of ['note','photo'] as const) test(`client depuis ${kind} : coordonnées complètes à relire avant la création`,async({page})=>{
 const {state,errors}=await fixture(page,false,true);
 if(kind==='note') await page.getByRole('textbox',{name:'Demande à MANUFEO'}).fill('DEGAND Lucie PACIFICA. Rendez-vous jeudi 8 octobre à 8h30. 56 rue du onze novembre 42100 Saint-Étienne. 0633383203 0477370265. Mail Lucie.degand@orange.fr.');
 else await page.getByLabel('Documents du client').setInputFiles({name:'note.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==','base64')});
 await page.getByRole('button',{name:'Lire et préparer le client',exact:true}).click();
 await expect(page.getByRole('button',{name:'Valider et exécuter',exact:true})).toBeVisible();
 expect(state.executions).toBe(0);expect(state.extractions).toBe(kind==='note'?0:1);
 expect(state.plans[0]).toMatchObject({sourceTarget:'customer',quoteSources:false,target:'command'});
 const review=page.locator('.ava-action-list article').first();
 await expect(review).toContainText('0633383203');await expect(review).toContainText('0477370265');
 await expect(review).toContainText('56 rue du onze novembre');await expect(review).toContainText('lucie.degand@orange.fr');
 await page.getByRole('button',{name:'Valider et exécuter',exact:true}).click();
 await expect(page.getByText('Client enregistré.',{exact:true})).toBeVisible();
 expect(state.executions).toBe(1);expect(errors).toEqual([]);
});

test('dossier photo : import multiple, sélection, erreur/réessai et envoi automatique activé uniquement sur le chantier choisi',async({page})=>{
 const {errors}=await fixture(page);
 let attempts=0;const reports:Record<string,unknown>[]=[];
 await page.route('https://sources.manufeo.test/api/projects/photo-report',async route=>{
  attempts++;reports.push(route.request().postDataJSON());
  expect(route.request().headers().authorization).toBe('Bearer test-token');
  if(attempts===1)return route.fulfill({status:409,json:{code:'photos_sync_pending',error:'Synchronisation en cours.'}});
  if(attempts===2)return route.fulfill({status:503,json:{error:'Envoi non confirmé. Réessayez.'}});
  return route.fulfill({json:{id:'sent-test'}});
 });
 await page.goto('https://sources.manufeo.test/projects');
 await page.getByRole('button',{name:'Photos',exact:true}).click();
 const auto=page.getByRole('checkbox',{name:'Envoyer automatiquement après chaque ajout'});
 await expect(auto).not.toBeChecked();
 const photo={mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGP8//8/AymAiSTVoxpGNQwpDQBVbQMdPVIhQwAAAABJRU5ErkJggg==','base64')};
 await page.getByLabel('Photos du chantier',{exact:true}).setInputFiles([{...photo,name:'avant.png'},{...photo,name:'apres.png'}]);
 await expect(page.getByRole('checkbox',{name:'Inclure avant.png'})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'Inclure apres.png'})).toBeVisible();expect(attempts).toBe(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forgeo-commercial-state-v2')!).projects[0].photos.length)).toBe(2);
 await page.getByRole('textbox',{name:'Destinataire',exact:true}).fill('autre@example.fr');
 await page.getByRole('checkbox',{name:'Inclure avant.png'}).uncheck();
 await page.getByRole('button',{name:'Envoyer le dossier au client',exact:true}).click();
 await expect(page.locator('.rm-photo-report [role=status]')).toContainText('Envoi non confirmé');
 expect(attempts).toBe(2);expect(reports[1]).toMatchObject({projectId:'P-1',to:'autre@example.fr'});
 expect((reports[1].photoIds as unknown[]).length).toBe(1);
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(Buffer.from(reports[1].content as string,'base64'))});
 try{const pdf=await task.promise;expect(pdf.numPages).toBe(1);expect((await(await pdf.getPage(1)).getOperatorList()).fnArray.length).toBeGreaterThan(10);}finally{await task.destroy();}
 await page.getByRole('button',{name:'Envoyer le dossier au client',exact:true}).click();
 await expect(page.locator('.rm-photo-report [role=status]')).toContainText('Dossier photo envoyé');expect(attempts).toBe(3);
 expect(reports[2].requestId).toBe(reports[1].requestId);expect(reports[2].content).toBe(reports[1].content);
 await auto.check();
 await page.getByLabel('Photos du chantier',{exact:true}).setInputFiles({...photo,name:'nouveau.png'});
 await expect(page.locator('.rm-photo-report [role=status]')).toContainText('Dossier photo envoyé');expect(attempts).toBe(4);
 expect((reports[3].photoIds as unknown[]).length).toBe(2);
 await page.getByRole('button',{name:/Autre chantier/}).click();
 await page.getByRole('button',{name:'Photos',exact:true}).click();
 await expect(auto).not.toBeChecked();
 await page.getByLabel('Photos du chantier',{exact:true}).setInputFiles({...photo,name:'autre.png'});
 await expect(page.getByRole('checkbox',{name:'Inclure autre.png'})).toBeVisible();expect(attempts).toBe(4);
 expect(errors).toEqual([]);
 await page.screenshot({animations: 'disabled',path:'tmp/philippe-project-photo-report.png',fullPage:true});
});
