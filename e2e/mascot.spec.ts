import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const build = buildSync({
 stdin:{resolveDir:root,loader:'tsx',contents:`
 import './app/action-voice-assistant.css';
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import ManufeoSplash from './app/manufeo-splash';
 import Welcome from './app/manufeo-mascot-welcome';
 import Mascot from './app/manufeo-mascot';
 import {VoiceListeningVisualizer,VoiceProcessingVisualizer} from './app/action-voice-experience';
 function Fixture(){const [stage,setStage]=useState('home'),[name,setName]=useState('Philippe');return <ManufeoSplash><main className="rm-shell"><h1>Devis</h1><button id="switch-user" onClick={()=>setName('Julie')}>Changer de compte</button><div className="rm-create-dock"><button id="start" onClick={()=>setStage('listening')}>Créer avec IA</button></div><Welcome key={name} user={{id:name,email:name.toLowerCase()+'@example.fr',user_metadata:{first_name:name}}}/></main>{stage!=='home'&&<div className="ava-overlay ava-overlay-immersive" role="dialog">{stage==='listening'?<VoiceListeningVisualizer level={.7} activity={.8} reactive onFinish={()=>setStage('processing')} onClose={()=>setStage('home')}/>:stage==='processing'?<><VoiceProcessingVisualizer onClose={()=>setStage('home')}/><button id="review" style={{position:'fixed',left:12,top:12,zIndex:10}} onClick={()=>setStage('review')}>Résultat du test</button></>:<div><Mascot mood="ready"/><button id="confirm">Valider et exécuter</button><button onClick={()=>setStage('home')}>Fermer</button></div>}</div>}</ManufeoSplash>};createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,outdir:'/tmp/mascot-browser-bundle',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':JSON.stringify({NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://help-backend.manufeo.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'})},tsconfig:path.join(root,'tsconfig.json'),
});
const script=build.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
const styles=build.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('sb-help-backend-auth-token',JSON.stringify({access_token:'test-token',refresh_token:'refresh-test',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'22222222-2222-4222-8222-222222222222'}}));});
 await page.route('https://help-backend.manufeo.test/**',route=>route.fulfill({json:route.request().url().includes('ensure_personal_organization')?'11111111-1111-4111-8111-111111111111':[]}));
 await page.route('https://mascot.manufeo.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}));
 await page.goto('https://mascot.manufeo.test/');
 await page.addStyleTag({content:readFileSync(path.join(root,'app/globals.css'),'utf8')+'\n'+styles+'\nbody{background:#020807;color:white;margin:0}.rm-shell{height:100dvh}.rm-create-dock{position:fixed;bottom:90px;height:54px;left:20px;right:20px}'});
 await page.addScriptTag({content:script});
 await page.locator('.manufeo-splash').waitFor({state:'detached'});
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
