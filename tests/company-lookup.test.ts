import assert from "node:assert/strict";
import test from "node:test";
import { companyLookupQuery, normalizeGovernmentCompanyResult, selectGovernmentCompany } from "../lib/company-lookup";
import {GET} from '../app/api/company-lookup/route';

test("normalise une entreprise de l'API gouvernementale", () => {
  const company = normalizeGovernmentCompanyResult({
    nom_raison_sociale: "ATELIER MARTIN",
    siren: "123456789",
    tva: ["FR00123456789"],
    siege: {
      siret: "12345678900012",
      adresse: "12 RUE DE LYON",
      code_postal: "69002",
      libelle_commune: "Lyon",
    },
  });
  assert.deepEqual(company, {
    companyName: "ATELIER MARTIN",
    siret: "12345678900012",
    siren: "123456789",
    vatNumber: "FR00123456789",
    address: "12 RUE DE LYON",
    postalCode: "69002",
    city: "Lyon",
  });
});

test('recherche par nom ou référence RCS sans confondre SIRET et SIREN',()=>{
 assert.equal(companyLookupQuery('Citya Montchalin','name'),'Citya Montchalin');
 assert.equal(companyLookupQuery('RCS Lyon B 123 456 789','rcs'),'123456789');
 assert.throws(()=>companyLookupQuery('123456789','siret'),/14 chiffres/);
 assert.throws(()=>companyLookupQuery('RCS Lyon','rcs'),/9 chiffres/);
 const result=selectGovernmentCompany([{nom_raison_sociale:'Agence',siren:'123456789',siege:{siret:'12345678900011',adresse:'Siège'},matching_etablissements:[{siret:'12345678900022',adresse:'Agence locale',code_postal:'42000',libelle_commune:'Saint-Étienne'}]}],'12345678900022');
 assert.equal(result?.address,'Agence locale');assert.equal(result?.siret,'12345678900022');
});

test('l’API renvoie les agences homonymes à sélectionner et résout le RCS exact',async()=>{
 const prior=globalThis.fetch;const calls:string[]=[];
 const companies=[{nom_raison_sociale:'AGENCE MARTIN',siren:'123456789',siege:{siret:'12345678900011'}},{nom_raison_sociale:'AGENCE MARTIN',siren:'987654321',siege:{siret:'98765432100022'}}];
 globalThis.fetch=async input=>{calls.push(String(input));return Response.json({results:companies});};
 try{
  const name=await GET(new Request('https://manufeo.test/api/company-lookup?mode=name&q=Agence%20Martin'));const result=await name.json();assert.equal(name.status,200);assert.equal(result.companies.length,2);assert.equal(result.company,null);
  const rcs=await GET(new Request('https://manufeo.test/api/company-lookup?mode=rcs&q=RCS%20Lyon%20B%20123%20456%20789'));assert.equal((await rcs.json()).company.siren,'123456789');assert.match(calls[1],/q=123456789/);
  assert.equal((await GET(new Request('https://manufeo.test/api/company-lookup?siret=123'))).status,400);
 }finally{globalThis.fetch=prior;}
});

test("sélectionne uniquement le SIRET exact", () => {
  const results = [
    { nom_raison_sociale: "A", siren: "123456789", siege: { siret: "12345678900011" } },
    { nom_raison_sociale: "B", siren: "987654321", siege: { siret: "98765432100022" } },
  ];
  assert.equal(selectGovernmentCompany(results, "98765432100022")?.companyName, "B");
  assert.equal(selectGovernmentCompany(results, "00000000000000"), null);
});
