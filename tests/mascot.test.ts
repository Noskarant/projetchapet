import test from 'node:test';
import assert from 'node:assert/strict';
import { mascotName, mascotGreetingKey, mascotPreparationMood, mascotVoiceLevel } from '../lib/mascot';

test('la mascotte accueille la personne et jamais son entreprise', () => {
 assert.equal(mascotName({user_metadata:{first_name:'Philippe',company_name:'Chapet'}}),'Philippe');
 assert.equal(mascotName({user_metadata:{full_name:'Noé ANTERIEUX'}}),'Noé');
 assert.equal(mascotName({user_metadata:{given_name:'Julie',full_name:'Autre Nom'}}),'Julie');
 assert.equal(mascotName({user_metadata:{name:'Jean-Pierre Dupont'}}),'Jean-Pierre');
});
test('les comptes sans prénom utilisent un accueil neutre et le changement de compte est indépendant', () => {
 assert.equal(mascotName(null),'');
 assert.equal(mascotName({user_metadata:{company_name:'MANUFEO'},email:'contact@manufeo.fr'}),'');
 assert.equal(mascotName({email:'philippe.chapet@example.fr'}),'Philippe');
 assert.equal(mascotName({email:'p123@example.fr'}),'');
 assert.equal(mascotName({user_metadata:{first_name:'<img src=x>'}}),'');
 assert.equal(mascotName({user_metadata:{first_name:'Blanche'}}),'Blanche');
});
test('l’accueil quotidien est propre à chaque compte et au jour local', () => {
 const date=new Date(2026,8,30,23,59);
 assert.equal(mascotGreetingKey('philippe',date),'manufeo:mascot:greeting:philippe:2026-09-30');
 assert.notEqual(mascotGreetingKey('philippe',date),mascotGreetingKey('noe',date));
 assert.notEqual(mascotGreetingKey('philippe',date),mascotGreetingKey('philippe',new Date(2026,9,1)));
});
test('la préparation alterne réflexion, écriture, réflexion et vérification sans arrêter la demande', () => {
 assert.deepEqual([0,2200,4400,6600,8800,11000].map(mascotPreparationMood),['thinking','writing','thinking','checking','thinking','writing']);
});
test('une amplitude micro invalide ne casse pas les styles et reste limitée', () => {
 assert.equal(mascotVoiceLevel(NaN),0);assert.equal(mascotVoiceLevel(Infinity),0);
 assert.equal(mascotVoiceLevel(-1),0);assert.equal(mascotVoiceLevel(2),1);assert.equal(mascotVoiceLevel(.6),.6);
});
