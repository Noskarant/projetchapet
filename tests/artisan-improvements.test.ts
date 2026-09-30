import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { defaultCompanyProfile } from '../lib/company-profile';
import { businessPeriod, businessIndicators } from '../lib/business-period';
import { applySpokenPercentageLines, recalculatePercentageLines, spokenDiscount } from '../lib/percentage-adjustments';
import { calculateQuotePreviewTotals } from '../lib/mobile-quote-preview';
import { convertQuoteToInvoice, seedMobileWorkspace, upsertInvoice } from '../lib/mobile-prototype';
import { learnedCostEstimate, EMPTY_COSTS } from '../lib/learned-costs';
import { zipArchive } from '../lib/zip-archive';
const profile=defaultCompanyProfile();
const workspace=seedMobileWorkspace();
const quote={...workspace.quotes[0],subtotal:1000,items:[{id:'paint',label:'Peinture',description:'',quantity:2,unit:'pot',unitPrice:500,taxRate:10}]};
test('RSE et remise dictées deviennent des montants recalculables, conservés en facture',()=>{
 const items=applySpokenPercentageLines(quote.items,'RSE à 1 pour cent et une remise de 4% sur le chantier');
 assert.equal(items.length,2);assert.equal(items[1].unitPrice,10);assert.equal(spokenDiscount('remise de 4%'),4);
 const totals=calculateQuotePreviewTotals(items,4);assert.equal(totals.subtotal,969.6);assert.equal(totals.total,1066.56);
 const invoice=convertQuoteToInvoice({...workspace,invoices:[]},{...quote,items},4).invoice;
 assert.equal(invoice.total,totals.total);
 const changed=recalculatePercentageLines([{...items[0],quantity:3},items[1]]);assert.equal(changed[1].unitPrice,15);
 assert.equal(calculateQuotePreviewTotals([{...items[0],quantity:3},items[1]],0).subtotal,1515);
});
test('les suppléments respectent chaque taux de TVA sans se compter eux-mêmes',()=>{
 const items=applySpokenPercentageLines([...quote.items,{...quote.items[0],id:'other',taxRate:20,unitPrice:250}],'RSE à 2%, frais de gestion à 3%');
 assert.equal(items.length,6);assert.equal(calculateQuotePreviewTotals(items,0).subtotal,1575);
 assert.equal(recalculatePercentageLines(items).at(-1)?.unitPrice,15);
});
test('modifier une facture ne referme pas un devis rouvert',()=>{
 const converted=convertQuoteToInvoice({...workspace,invoices:[]},quote);
 const reopened={...converted.workspace,quotes:converted.workspace.quotes.map(q=>q.id===quote.id?{...q,status:'En attente' as const}:q)};
 assert.equal(upsertInvoice(reopened,{...converted.invoice,status:'Payée'}).quotes.find(q=>q.id===quote.id)?.status,'En attente');
});
test('le bilan compare les mêmes dates de l’exercice précédent',()=>{
 const dates=businessPeriod({...profile,accountingStart:'07-01'},new Date('2026-09-30T12:00Z'));
 assert.deepEqual(dates,{from:'2026-07-01',to:'2026-09-30',previousFrom:'2025-07-01',previousTo:'2025-09-30'});
 const earlier=businessPeriod({...profile,accountingStart:'07-01'},new Date('2026-02-15T12:00Z'));assert.equal(earlier.from,'2025-07-01');
});
test('les trois mois glissants et l’année bissextile restent exacts',()=>{
 assert.equal(businessPeriod({...profile,dashboardPeriod:'rolling3'},new Date('2026-09-30')).from,'2026-07-01');
 const leap=businessPeriod({...profile,dashboardPeriod:'month'},new Date('2024-02-29'));assert.equal(leap.previousTo,'2023-02-28');
});
test('les indicateurs excluent les brouillons et déduisent les avoirs',()=>{
 const invoice=workspace.invoices[0];const entries=[{...invoice,issueDate:'2026-09-03',subtotal:100,status:'Payée' as const},{...invoice,issueDate:'2026-09-04',subtotal:200,status:'Brouillon' as const},{...invoice,issueDate:'2026-09-05',subtotal:-20,status:'Avoir' as const},{...invoice,issueDate:'2025-09-03',subtotal:40,status:'Payée' as const}];
 const result=businessIndicators(entries,{...profile,dashboardPeriod:'month'},new Date('2026-09-30'));assert.equal(result.revenue,80);assert.equal(result.previous,40);assert.equal(result.evolution,100);
});
test('l’apprentissage utilise uniquement les coûts réels confirmés et des chantiers comparables',()=>{
 const sample={quoteId:'past',title:'Peinture chambre',revenue:2000,costs:{...EMPTY_COSTS,labourCost:400,labourHours:10,materialCost:600},confirmed:true};
 assert.equal(learnedCostEstimate({...quote,title:'Peinture salon'},[{...sample,confirmed:false}]),null);
 const estimate=learnedCostEstimate({...quote,title:'Peinture salon'},[sample,{...sample,quoteId:'unrelated',title:'Toiture',costs:{...EMPTY_COSTS,labourCost:1800}}]);
 assert.equal(estimate?.costs.labourCost,200);assert.equal(estimate?.hourlyRate,40);assert.equal(estimate?.samples,1);
});
test('le dossier mensuel est un ZIP lisible avec les vrais fichiers intacts',()=>{
 const archive=zipArchive([{name:'F-001.pdf',content:Buffer.from('%PDF-test')},{name:'récap.csv',content:Buffer.from('montant;100')}]);
 const result=execFileSync('python',['-c','import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:z.read(n).decode() for n in z.namelist()},ensure_ascii=False))'],{input:archive,encoding:'utf8'});
 assert.deepEqual(JSON.parse(result),{'F-001.pdf':'%PDF-test','récap.csv':'montant;100'});
});

test('un poste RSE déjà préparé ne double pas le supplément',()=>{
 const items=applySpokenPercentageLines([...quote.items,{...quote.items[0],id:'rse',label:'RSE (1 %)',quantity:1,unitPrice:10}],'RSE à 1%');
 assert.equal(items.length,2);assert.equal(calculateQuotePreviewTotals(items,0).subtotal,1010);
});
