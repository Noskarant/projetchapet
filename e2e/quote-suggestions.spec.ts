import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(__dirname,'..');
const build=buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import Suggestions from './app/quote-suggestions'; import {applyQuoteSuggestion} from './lib/quote-suggestions';
import {normalizeQuote} from './lib/mobile-prototype';
const initial={id:'q',number:'D-1',customerId:'c',customerName:'Dupont',title:'Peinture salon',status:'En attente',issueDate:'2026-10-01',expiryDate:'2026-11-01',notes:'',subtotal:300,taxTotal:30,total:330,items:[{id:'p',label:'Peinture murs',description:'',quantity:10,unit:'m²',unitPrice:30,taxRate:10}]};
function Fixture(){const [quote,setQuote]=useState(initial),[fail,setFail]=useState(false);return <section className="rm-philippe-preview"><header className="rm-philippe-preview-header"><h2>Devis D-1</h2></header><Suggestions quote={quote} onApply={async(s,input)=>{if(fail)throw new Error('Enregistrement impossible.');setQuote(q=>normalizeQuote(applyQuoteSuggestion(q,s,input)));}}/><div className="rm-philippe-summary"><span>Dupont · Peinture salon</span></div><nav className="rm-philippe-preview-tabs"><button>Détail des postes</button><button>PDF</button></nav><div className="rm-philippe-preview-scroll">{quote.items.map(item=><p key={item.id}>{item.label}</p>)}<p id="total">Total : {quote.total}</p>{Array.from({length:50},(_,i)=><p key={i}>Poste supplémentaire {i}</p>)}<button id="failure" onClick={()=>setFail(true)}>Simuler erreur cloud</button></div><footer className="rm-philippe-preview-actions"><button>Envoyer</button></footer></section>};createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,outdir:'/tmp/suggestion-browser-bundle',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json')});
const script=build.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
const css=build.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');
test.beforeEach(async({page})=>{
 await page.route('https://suggestions.manufeo.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));
 await page.goto('https://suggestions.manufeo.test/');
 await page.addStyleTag({content:readFileSync(path.join(root,'app/mobile-quote-preview.css'),'utf8')+'\n'+readFileSync(path.join(root,'app/mobile-quote-preview-scroll-fix.css'),'utf8')+'\n'+css+'\nbody{margin:0}'});
 await page.addScriptTag({content:script});
});
test('suggestions visibles à l’ouverture et pendant le défilement sans chevauchement',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const region=page.getByRole('region',{name:'Suggestions MANUFEO'});
 await expect(region).toBeInViewport();await expect(region).toContainText('suggestions pour ton devis');
 const before=await region.boundingBox();
 await page.locator('.rm-philippe-preview-scroll').evaluate(el=>el.scrollTop=1000);
 expect((await region.boundingBox())!.y).toBe(before!.y);
 await page.getByRole('button',{name:/Psst/}).click();
 const content=await page.locator('.quote-suggestions').boundingBox();const footer=await page.locator('.rm-philippe-preview-actions').boundingBox();
 expect(content!.y+content!.height).toBeLessThanOrEqual(footer!.y);
 await page.screenshot({path:test.info().outputPath('suggestions-visible.png')});
 expect(errors).toEqual([]);
});
test('ajout confirmé seulement, total recalculé et suggestion retirée',async({page})=>{
 await page.getByRole('button',{name:/Psst/}).click();await page.getByRole('button',{name:'Ajouter',exact:true}).click();
 await expect(page.locator('#total')).toHaveText('Total : 330');
 await page.getByLabel('Prix suggestion').fill('80');await page.getByRole('button',{name:'Confirmer l’ajout'}).click();
 await expect(page.locator('#total')).toHaveText('Total : 418');
 await expect(page.locator('.rm-philippe-preview-scroll')).toContainText('Protection des sols et du mobilier');
 await expect(page.locator('.quote-suggestions-intro small')).not.toContainText('Protection');
});
test('ignorer ne modifie pas le devis et un échec laisse réessayer',async({page})=>{
 await page.getByRole('button',{name:/Psst/}).click();await page.getByRole('button',{name:'Ignorer',exact:true}).click();
 await expect(page.locator('#total')).toHaveText('Total : 330');
 await page.locator('#failure').click();await page.getByRole('button',{name:'Ajouter',exact:true}).click();
 await page.getByLabel('Quantité suggestion').fill('10');await page.getByLabel('Prix suggestion').fill('20');
 await page.getByRole('button',{name:'Confirmer l’ajout'}).click();
 await expect(page.getByRole('alert')).toHaveText('Enregistrement impossible.');
 await expect(page.getByRole('button',{name:'Confirmer l’ajout'})).toBeEnabled();
 await expect(page.locator('#total')).toHaveText('Total : 330');
});
