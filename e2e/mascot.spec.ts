import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const build = buildSync({
 stdin:{resolveDir:root,loader:'tsx',contents:`
 import './app/action-voice-assistant.css';
 import './app/rappidos-mobile-shell.css';
 import './app/mobile-premium-polish.css';
 import './app/tablet-app.css';
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import ManufeoSplash from './app/manufeo-splash';
 import Welcome from './app/manufeo-mascot-welcome';
 import Mascot from './app/manufeo-mascot';
 import Shell from './app/rappidos-mobile-shell-v2';
 import {VoiceListeningVisualizer,VoiceProcessingVisualizer} from './app/action-voice-experience';
 function Fixture(){const [stage,setStage]=useState('home'),[name,setName]=useState('Philippe');return <ManufeoSplash>{location.search.includes('workspace')?<Shell/>:<main className="rm-shell"><h1>Devis</h1><button id="switch-user" onClick={()=>setName('Julie')}>Changer de compte</button><div className="rm-create-dock"><button id="start" onClick={()=>setStage('listening')}>Créer avec IA</button></div></main>}<Welcome key={name} user={{id:name,email:name.toLowerCase()+'@example.fr',user_metadata:{first_name:name}}}/>{stage!=='home'&&<div className="ava-overlay ava-overlay-immersive" role="dialog">{stage==='listening'?<VoiceListeningVisualizer level={.7} activity={.8} reactive onFinish={()=>setStage('processing')} onClose={()=>setStage('home')}/>:stage==='processing'?<><VoiceProcessingVisualizer onClose={()=>setStage('home')}/><button id="review" style={{position:'fixed',left:12,top:12,zIndex:10}} onClick={()=>setStage('review')}>Résultat du test</button></>:<div><Mascot mood="ready"/><button id="confirm">Valider et exécuter</button><button onClick={()=>setStage('home')}>Fermer</button></div>}</div>}</ManufeoSplash>};createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,outdir:'/tmp/mascot-browser-bundle',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://help-backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'})},tsconfig:path.join(root,'tsconfig.json'),
});
const script=build.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
const styles=build.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');

async function mountFixture(page: Page, search = '') {
 await page.goto('https://mascot.manufeo.test/'+search);
 await page.addStyleTag({content:readFileSync(path.join(root,'app/globals.css'),'utf8')+'\n'+styles+'\nbody{background:#020807;color:white;margin:0}.rm-shell{height:100dvh}.rm-create-dock{position:fixed;bottom:90px;height:54px;left:20px;right:20px}'});
 await page.addScriptTag({content:script});
 await page.locator('.manufeo-splash').waitFor({state:'detached'});
}

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('sb-help-backend-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'refresh-test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'22222222-2222-4222-8222-222222222222'}}));});
 await page.route('https://help-backend.manufeo.test/**',route=>route.fulfill({json:route.request().url().includes('ensure_personal_organization')?'11111111-1111-4111-8111-111111111111':[]}));
 await page.route('https://mascot.manufeo.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}));
 await mountFixture(page);
});

test('accueil personnel, quotidien, discret et masquable',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByText('Bonjour Philippe !')).toBeVisible();
 const welcome=await page.locator('.manufeo-mascot-welcome').boundingBox();const dock=await page.locator('.rm-create-dock').boundingBox();
 expect(welcome!.y+welcome!.height).toBeLessThan(dock!.y);
 expect(welcome!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
 await page.getByRole('button',{name:'Aide de la mascotte',exact:true}).click();
 await expect(page.getByText('Un coup de main ?')).toBeVisible();
 await page.locator('#switch-user').click();await expect(page.getByText('Bonjour Julie !')).toBeVisible();
 await page.getByRole('button',{name:'Masquer la mascotte pour cette ouverture'}).click();await expect(page.locator('.manufeo-mascot-welcome')).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('manufeo:mascot:greeting:')).length)).toBe(2);
 expect(errors).toEqual([]);
});

test('deuxième appui, réflexion, écriture, vérification et fermeture',async({page},testInfo)=>{
 await page.locator('#start').click();
 await expect(page.locator('.manufeo-mascot-welcome')).toHaveCount(0);
 const robot=page.locator('[data-testid="voice-listening-visualizer"] .manufeo-mascot');await expect(robot).toHaveAttribute('data-mood','listening');
 const box=await robot.boundingBox();expect(box!.height).toBeLessThanOrEqual(190);
 expect(await robot.locator('.mascot-sound').evaluate(el=>getComputedStyle(el).opacity)).not.toBe('0');
 await page.screenshot({path:testInfo.outputPath('mascot-listening.png')});
 const before=await robot.locator('.mascot-head').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(500);expect(await robot.locator('.mascot-head').evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
 await page.getByRole('button',{name:'J’ai fini de parler'}).click();
 const processing=page.locator('[data-testid="voice-processing-visualizer"] .manufeo-mascot');await expect(processing).toHaveAttribute('data-mood','thinking');
 await expect(processing).toHaveAttribute('data-mood','writing',{timeout:5000});
 await page.screenshot({path:testInfo.outputPath('mascot-writing.png')});
 const writing=processing.locator('.mascot-writing-arm');expect(await writing.evaluate(el=>getComputedStyle(el).display)).not.toBe('none');const hand=await writing.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(300);expect(await writing.evaluate(el=>getComputedStyle(el).transform)).not.toBe(hand);
 await expect(processing).toHaveAttribute('data-mood','checking',{timeout:6000});
 await page.locator('#review').click();await expect(page.locator('.manufeo-mascot[data-mood="ready"]')).toBeVisible();await expect(page.locator('#confirm')).toBeVisible();
 await page.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.locator('.ava-overlay')).toHaveCount(0);
 await page.locator('#start').click();await page.getByRole('button',{name:'Fermer',exact:true}).click();await expect(page.locator('.ava-overlay')).toHaveCount(0);
});

test('réduire les animations reste compatible avec la dictée',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#start').click();
 expect(await page.locator('.mascot-head').last().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('button',{name:'J’ai fini de parler'}).click();await expect(page.locator('[data-testid="voice-processing-visualizer"]')).toBeVisible();
});

test('cliquer sur l’agent ouvre une vraie conversation, conserve la question en cas de panne et permet une relance',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const requests:Array<{question:string;history:Array<{role:string;content:string}>}>=[];
 await page.route('https://mascot.manufeo.test/api/ai/help',async route=>{
  expect(route.request().headers().authorization).toBe('Bearer test-token');
  requests.push(route.request().postDataJSON());
  if(requests.length===1)return route.fulfill({status:503,json:{error:'L’agent est momentanément indisponible. Réessayez.'}});
  return route.fulfill({json:{answer:requests.length===2?'Ouvrez Créer, puis Photos ou documents. Collez le devis fournisseur et relisez les prix.':'Oui, ajoutez 30 dans Majoration sur les prix HT (%). 100 € HT devient 130 € HT.'}});
 });
 await page.getByRole('button',{name:'Poser une question à l’agent MANUFEO',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Posez votre question',exact:true});await expect(dialog).toBeVisible();
 expect(await page.locator('.manufeo-mascot-welcome').count()).toBe(0);
 const question=dialog.getByRole('textbox',{name:'Votre question',exact:true});
 await question.fill('Comment reprendre mon devis fournisseur ?');await dialog.getByRole('button',{name:'Poser la question',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('indisponible');await expect(question).toHaveValue('Comment reprendre mon devis fournisseur ?');
 await dialog.getByRole('button',{name:'Poser la question',exact:true}).click();
 await expect(dialog.getByRole('log')).toContainText('Collez le devis fournisseur');
 await question.fill('Et pour ajouter 30 % ?');await dialog.getByRole('button',{name:'Poser la question',exact:true}).click();
 await expect(dialog.getByRole('log')).toContainText('100 € HT devient 130 € HT');
 expect(requests[2].history).toHaveLength(2);expect(requests[2].history[0].role).toBe('user');
 const panel=await dialog.boundingBox();expect(panel!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);expect(panel!.height).toBeLessThanOrEqual((await page.viewportSize())!.height);
 await page.screenshot({path:testInfo.outputPath('agent-questions.png')});
 await dialog.getByRole('button',{name:'Fermer les questions à l’agent',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.manufeo-mascot-welcome')).toBeVisible();expect(errors).toEqual([]);
});

test('l’agent sépare les questions de la création IA et se ferme au clavier',async({page})=>{
 const opened=await page.evaluate(()=>{(window as unknown as {opened:string[]}).opened=[];window.addEventListener('projetchapet:open-ai',event=>{(window as unknown as {opened:string[]}).opened.push((event as CustomEvent).detail.target)});return true;});expect(opened).toBe(true);
 await page.getByRole('button',{name:'Poser une question à l’agent MANUFEO',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Créer avec IA',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as unknown as {opened:string[]}).opened)).toEqual(['command']);
 await page.getByRole('button',{name:'Poser une question à l’agent MANUFEO',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('l’icône reste accessible sur l’accueil et tous les onglets après avoir masqué la mascotte',async({page},testInfo)=>{
 await mountFixture(page,'?workspace');
 await page.evaluate(()=>{
  const account=document.createElement('button');account.type='button';account.setAttribute('aria-label','Compte MANUFEO');account.textContent='P';document.querySelector('.rm-header-actions')!.append(account);
 });
 const floating=page.getByRole('button',{name:'Poser une question à l’agent MANUFEO',exact:true});
 await expect(floating).toBeVisible();
 const floatingBox=(await floating.boundingBox())!;
 expect(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.manufeo-mascot-toggle')),{x:floatingBox.x+floatingBox.width/2,y:floatingBox.y+floatingBox.height/2})).toBe(true);
 await page.getByRole('button',{name:'Masquer la mascotte pour cette ouverture'}).click();
 await expect(page.locator('.manufeo-mascot-welcome')).toHaveCount(0);
 const launcher=page.getByRole('button',{name:'Questions à MANUFEO',exact:true});
 for(const name of ['Accueil','Devis','Factures','Clients','Agenda']) {
  await page.locator('.rm-bottom-nav').getByRole('button',{name,exact:true}).click();
  await expect(launcher).toBeVisible();
  const box=(await launcher.boundingBox())!,title=(await page.locator('.rm-header h1').boundingBox())!;
  expect(title.x+title.width).toBeLessThanOrEqual(box.x+1);
  expect(box.x+box.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
  expect(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.manufeo-help-launcher')),{x:box.x+box.width/2,y:box.y+box.height/2})).toBe(true);
 }
 await page.locator('.rm-bottom-nav').getByRole('button',{name:'Accueil',exact:true}).click();
 await page.screenshot({path:testInfo.outputPath('permanent-mascot-home.png')});
 await page.route('https://mascot.manufeo.test/api/ai/help',route=>route.fulfill({json:{answer:'Ouvrez Créer, puis Photos ou documents.'}}));
 await launcher.click();
 const dialog=page.getByRole('dialog',{name:'Posez votre question',exact:true});await expect(dialog).toBeVisible();
 await expect(page.locator('body > .manufeo-help-backdrop')).toBeVisible();
 await dialog.getByRole('textbox',{name:'Votre question',exact:true}).fill('Comment importer une photo ?');
 await dialog.getByRole('button',{name:'Poser la question',exact:true}).click();
 await expect(dialog.getByRole('log')).toContainText('Photos ou documents');
 const panel=(await dialog.boundingBox())!;expect(panel.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(launcher).toBeFocused();
 await launcher.click();await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Fermer les questions à l’agent',exact:true}).click();await expect(launcher).toBeVisible();
});

async function mockHelpMicrophone(page: Page, mode: 'silence' | 'talk' | 'denied' | 'deferred' = 'silence') {
 await page.evaluate(mode=>{
  const state={mode,speechSamples:0,streams:0,stops:0,closed:0,speechStarted:false,release:null as null|(()=>void)};
  (window as unknown as {helpVoiceTest:typeof state}).helpVoiceTest=state;
  const stream=()=>{state.streams++;return {getTracks:()=>[{stop:()=>{state.stops++;}}]};};
  class FakeRecorder {
   static isTypeSupported(type:string){return type==='audio/mp4';}
   state='inactive';mimeType:string;ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
   constructor(_stream:unknown,options?:{mimeType:string}){this.mimeType=options?.mimeType||'audio/mp4';}
   start(){this.state='recording';state.speechSamples=0;}
   stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array(1024)],{type:this.mimeType})});window.setTimeout(()=>this.onstop?.(),0);}
  }
  class FakeAudio {
   state='running';resume(){return Promise.resolve();}close(){this.state='closed';state.closed++;return Promise.resolve();}
   createMediaStreamSource(){return {connect(){},disconnect(){}};}
   createAnalyser(){
    return {fftSize:1024,disconnect(){},getFloatTimeDomainData(samples:Float32Array){
     // Supply a complete phrase even when WebKit's timers are delayed under CI load.
     const speaking = state.mode==='talk' || state.speechSamples++<6;
     samples.fill(speaking ? .06 : 0);
    }};
   }
  }
  class FakeSpeech {start(){state.speechStarted=true;}}
  Object.defineProperty(window,'AudioContext',{configurable:true,value:FakeAudio});
  Object.defineProperty(window,'MediaRecorder',{configurable:true,value:FakeRecorder});
  Object.defineProperty(window,'webkitSpeechRecognition',{configurable:true,value:FakeSpeech});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
   if(state.mode==='denied')throw new DOMException('Denied','NotAllowedError');
   if(state.mode==='deferred')return new Promise(resolve=>{state.release=()=>resolve(stream());});
   return stream();
  }}});
 },mode);
}

async function openHelp(page: Page) {
 await page.getByRole('button',{name:'Poser une question à l’agent MANUFEO',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Posez votre question',exact:true});await expect(dialog).toBeVisible();return dialog;
}

test('question vocale : fin de phrase, envoi automatique unique, réponse et relance sans confirmation',async({page},testInfo)=>{
 await mockHelpMicrophone(page);
 let transcriptions=0;const requests:Array<{question:string;history:unknown[]}> = [];
 await page.route('https://mascot.manufeo.test/api/transcribe',route=>{
  expect(route.request().headers().authorization).toBe('Bearer test-token');
  const body=route.request().postDataBuffer()!.toString();expect(body).toContain('question.m4a');expect(body).toContain('audio/mp4');
  transcriptions++;return route.fulfill({json:{text:transcriptions===1?'Comment envoyer ma facture ?':'Et à une autre adresse ?'}});
 });
 await page.route('https://mascot.manufeo.test/api/ai/help',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{answer:requests.length===1?'Ouvrez le document puis Envoyer.':'Vous pouvez modifier le destinataire avant l’envoi.'}});});
 const dialog=await openHelp(page);
 await expect(dialog.getByRole('textbox',{name:'Votre question',exact:true})).not.toBeFocused();
 await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Terminer et envoyer',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('help-voice-listening.png')});
 await expect(dialog.getByRole('log')).toContainText('Ouvrez le document puis Envoyer.');
 expect(transcriptions).toBe(1);expect(requests).toHaveLength(1);expect(requests[0].question).toBe('Comment envoyer ma facture ?');
 await expect(dialog.getByRole('textbox',{name:'Votre question',exact:true})).not.toBeFocused();
 await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await expect(dialog.getByRole('log')).toContainText('modifier le destinataire');
 expect(transcriptions).toBe(2);expect(requests).toHaveLength(2);expect(requests[1].history).toHaveLength(2);
 const state=await page.evaluate(()=>(window as unknown as {helpVoiceTest:{stops:number;closed:number;speechStarted:boolean}}).helpVoiceTest);
 expect(state.stops).toBe(2);expect(state.closed).toBe(2);expect(state.speechStarted).toBe(false);
 await page.screenshot({path:testInfo.outputPath('help-voice-answer.png')});
});

test('terminer la question vocale envoie directement et une panne de réponse conserve le texte',async({page})=>{
 await mockHelpMicrophone(page,'talk');let transcriptions=0,answers=0;
 await page.route('https://mascot.manufeo.test/api/transcribe',route=>{transcriptions++;return route.fulfill({json:{text:'Comment ajouter une marge ?'}});});
 await page.route('https://mascot.manufeo.test/api/ai/help',route=>{answers++;return route.fulfill(answers===1?{status:503,json:{error:'Agent momentanément indisponible.'}}:{json:{answer:'Indiquez le pourcentage dans Majoration sur les prix HT.'}});});
 const dialog=await openHelp(page);await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await dialog.getByRole('button',{name:'Terminer et envoyer',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('indisponible');
 await expect(dialog.getByRole('textbox',{name:'Votre question',exact:true})).toHaveValue('Comment ajouter une marge ?');
 await dialog.getByRole('button',{name:'Poser la question',exact:true}).click();
 await expect(dialog.getByRole('log')).toContainText('Majoration sur les prix HT');expect(transcriptions).toBe(1);expect(answers).toBe(2);
});

test('micro refusé, annulation et fermeture arrêtent les ressources sans envoyer de question',async({page})=>{
 await mockHelpMicrophone(page,'denied');let requests=0;
 await page.route('https://mascot.manufeo.test/api/transcribe',route=>{requests++;return route.fulfill({json:{text:'Texte interdit après annulation'}});});
 const dialog=await openHelp(page);await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Micro refusé');
 await page.evaluate(()=>{(window as unknown as {helpVoiceTest:{mode:string}}).helpVoiceTest.mode='talk';});
 await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await dialog.getByRole('button',{name:'Annuler la question vocale',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Terminer et envoyer',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Fermer les questions à l’agent',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 const state=await page.evaluate(()=>(window as unknown as {helpVoiceTest:{streams:number;stops:number;closed:number}}).helpVoiceTest);
 expect(state.streams).toBe(2);expect(state.stops).toBe(2);expect(state.closed).toBe(3);expect(requests).toBe(0);
});

test('fermer pendant l’autorisation micro libère aussi un flux arrivé plus tard',async({page})=>{
 await mockHelpMicrophone(page,'deferred');let requests=0;
 await page.route('https://mascot.manufeo.test/api/transcribe',route=>{requests++;return route.fulfill({json:{text:'Texte interdit après fermeture'}});});
 const dialog=await openHelp(page);await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Ouverture du micro…',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {helpVoiceTest:{release:null|(()=>void)}}).helpVoiceTest.release))).toBe(true);
 await dialog.getByRole('button',{name:'Fermer les questions à l’agent',exact:true}).click();
 await page.evaluate(()=>{(window as unknown as {helpVoiceTest:{release:()=>void}}).helpVoiceTest.release();});
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {helpVoiceTest:{stops:number}}).helpVoiceTest.stops)).toBe(1);
 expect(requests).toBe(0);
});

test('une transcription vide ne pose pas de question et le micro permet de réessayer',async({page})=>{
 await mockHelpMicrophone(page,'talk');let transcriptions=0,answers=0;
 await page.route('https://mascot.manufeo.test/api/transcribe',route=>{transcriptions++;return route.fulfill({json:{text:transcriptions===1?'':'Comment envoyer une facture ?'}});});
 await page.route('https://mascot.manufeo.test/api/ai/help',route=>{answers++;return route.fulfill({json:{answer:'Ouvrez la facture puis Envoyer.'}});});
 const dialog=await openHelp(page);
 for(let attempt=0;attempt<2;attempt++) {
  await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();await dialog.getByRole('button',{name:'Terminer et envoyer',exact:true}).click();
  if(attempt===0){await expect(dialog.getByRole('alert')).toContainText('Aucune parole');expect(answers).toBe(0);}
 }
 await expect(dialog.getByRole('log')).toContainText('Ouvrez la facture puis Envoyer');expect(answers).toBe(1);expect(transcriptions).toBe(2);
});

test('annuler une transcription bloque la question même si la réponse arrive ensuite',async({page})=>{
 await mockHelpMicrophone(page,'talk');let answers=0;
 const pending=page.waitForRequest('https://mascot.manufeo.test/api/transcribe');
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('https://mascot.manufeo.test/api/transcribe',async route=>{await gate;await route.fulfill({json:{text:'Question annulée'}}).catch(()=>{});});
 await page.route('https://mascot.manufeo.test/api/ai/help',route=>{answers++;return route.fulfill({json:{answer:'Cette réponse ne doit pas apparaître.'}});});
 const dialog=await openHelp(page);await dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true}).click();
 await dialog.getByRole('button',{name:'Terminer et envoyer',exact:true}).click();await pending;
 await dialog.getByRole('button',{name:'Annuler la question vocale',exact:true}).click();finish();
 await expect(dialog.getByRole('button',{name:'Parler à MANUFEO',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('textbox',{name:'Votre question',exact:true})).toHaveValue('');
 await expect(dialog.getByRole('log')).not.toContainText('Question annulée');expect(answers).toBe(0);
});

test('l’ouverture garde le clavier fermé et le formulaire reste visible dans le viewport du clavier',async({page},testInfo)=>{
 await page.evaluate(()=>{
  const viewport=Object.assign(new EventTarget(),{height:window.innerHeight,offsetTop:0});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  (window as unknown as {resizeHelpViewport:(height:number,top:number)=>void}).resizeHelpViewport=(height,top)=>{viewport.height=height;viewport.offsetTop=top;viewport.dispatchEvent(new Event('resize'));};
 });
 const dialog=await openHelp(page);
 await expect(dialog.getByRole('textbox',{name:'Votre question',exact:true})).not.toBeFocused();
 await page.screenshot({path:testInfo.outputPath('help-voice-home.png')});
 await dialog.getByRole('textbox',{name:'Votre question',exact:true}).focus();
 await page.evaluate(()=>{(window as unknown as {resizeHelpViewport:(height:number,top:number)=>void}).resizeHelpViewport(360,28);});
 await expect.poll(async()=>Math.round((await page.locator('.manufeo-help-backdrop').boundingBox())!.height)).toBe(360);
 const close=(await dialog.getByRole('button',{name:'Fermer les questions à l’agent',exact:true}).boundingBox())!,input=(await dialog.getByRole('textbox',{name:'Votre question',exact:true}).boundingBox())!;
 expect(close.y).toBeGreaterThanOrEqual(28);expect(input.y+input.height).toBeLessThanOrEqual(388);
 const box=(await dialog.boundingBox())!;expect(box.width).toBeLessThanOrEqual((await page.viewportSize())!.width);expect(box.height).toBeLessThanOrEqual(360);
 await page.screenshot({path:testInfo.outputPath('help-voice-keyboard.png')});
});
