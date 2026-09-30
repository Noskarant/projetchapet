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
 `},bundle:true,write:false,outdir:'/tmp/mascot-browser-bundle',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json'),
});
const script=build.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
const styles=build.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');

test.beforeEach(async({page})=>{
 await page.route('https://mascot.manufeo.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));
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
