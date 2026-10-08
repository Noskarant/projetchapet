import test from 'node:test';
import assert from 'node:assert/strict';
import {clientPortalUrl, changeCustomerPortal, normalizeCustomerPortals, resolveCustomerPortal} from '../lib/customer-portals';
import {diffById, preservePendingWorkspaceChanges, workspaceForFlushScope} from '../lib/mobile-desktop-sync';
import {seedMobileWorkspace} from '../lib/mobile-prototype';

const quoteId = 'aaaaaaaa-2222-4333-8444-555555555555', invoiceId = 'bbbbbbbb-2222-4333-8444-555555555555';

test('le lien du dossier prime sur le portail général et suit le devis vers la facture', () => {
  const links = normalizeCustomerPortals({customer:'https://client.example/portail',quotes:{[quoteId]:'https://collab.citya.com/detail/%40contact/%23ENTREPRISE/opaque-token'},invoices:{[invoiceId]:'https://client.example/facture'}});
  assert.equal(resolveCustomerPortal(links,{quoteId}),'https://collab.citya.com/detail/%40contact/%23ENTREPRISE/opaque-token');
  assert.equal(resolveCustomerPortal(links,{quoteId,invoiceId}),'https://client.example/facture');
  assert.equal(resolveCustomerPortal(links,{quoteId,invoiceId:'cccccccc-2222-4333-8444-555555555555'}),links.quotes[quoteId]);
  assert.equal(resolveCustomerPortal(links),links.customer);
});

test('les liens invalides ou exécutables sont rejetés et les liens opaques restent intacts', () => {
  for (const url of ['javascript:alert(1)','data:text/html,unsafe','http://client.example','https://user:password@client.example','not-a-url']) assert.equal(clientPortalUrl(url),'');
  assert.equal(clientPortalUrl(' https://collab.citya.com/%40contact/%23COMPANY/abcdef?token=opaque#dossier '),'https://collab.citya.com/%40contact/%23COMPANY/abcdef?token=opaque#dossier');
  assert.deepEqual(normalizeCustomerPortals({quotes:{[quoteId]:'javascript:alert(1)'},customer:'unsafe'}),{customer:undefined,quotes:{},invoices:{}});
  assert.throws(()=>changeCustomerPortal(normalizeCustomerPortals({}),{},'invalid'),/https/);
});

test('changer ou retirer un lien préserve les autres dossiers du client', () => {
  const original = normalizeCustomerPortals({customer:'https://client.example',quotes:{[quoteId]:'https://client.example/devis'},invoices:{[invoiceId]:'https://client.example/facture'}});
  const next = changeCustomerPortal(original,{quoteId},'https://client.example/nouveau');
  assert.equal(next.customer,original.customer); assert.deepEqual(next.invoices,original.invoices);
  assert.equal(original.quotes[quoteId],'https://client.example/devis');
  const removed = changeCustomerPortal(next,{quoteId},'');
  assert.equal(removed.quotes[quoteId],undefined); assert.equal(resolveCustomerPortal(removed,{quoteId}),original.customer);
});

test('modifier le lieu du chantier ne soumet aucune modification d’une autre facture émise', () => {
  const baseline=seedMobileWorkspace(), quote=baseline.quotes[0], invoice=baseline.invoices[0];
  const local={...baseline,quotes:baseline.quotes.map(item=>item.id===quote.id?{...item,notes:'Lieu du chantier : 16 boulevard Karl Marx, chez M. Crozier.'}:item),invoices:baseline.invoices.map(item=>item.id===invoice.id?{...item,notes:'Une modification locale non sauvegardable'}:item)};
  const scoped=workspaceForFlushScope(baseline,local,{entity:'quote',id:quote.id});
  assert.equal(diffById(baseline.quotes,scoped.quotes).updated.length,1);
  assert.deepEqual(diffById(baseline.invoices,scoped.invoices),{created:[],updated:[],deleted:[]});
  const canonical={...baseline,quotes:scoped.quotes};
  const result=preservePendingWorkspaceChanges(scoped,local,canonical);
  assert.equal(result.quotes[0].notes,local.quotes[0].notes); assert.equal(result.invoices[0].notes,local.invoices[0].notes);
});

test('la sauvegarde ciblée garde les suppressions, les autres changements et l’ordre des documents', () => {
  const baseline=seedMobileWorkspace();
  assert.deepEqual(workspaceForFlushScope(baseline,baseline,{entity:'quote',id:baseline.quotes[0].id}),baseline);
  const local={...baseline,quotes:baseline.quotes.slice(1)};
  assert.deepEqual(diffById(baseline.quotes,workspaceForFlushScope(baseline,local,{entity:'quote',id:baseline.quotes[0].id}).quotes).deleted,[baseline.quotes[0]]);
  assert.equal(workspaceForFlushScope(baseline,local),local);
});
