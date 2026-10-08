import test from 'node:test';
import assert from 'node:assert/strict';
import {customerContactPatch} from '../lib/customer-contact-merge';
import {normalizeSpokenEmail,normalizeVoiceTranscript,spokenEmailsFromTranscript} from '../lib/voice-facts';
import {seedMobileWorkspace} from '../lib/mobile-prototype';
import {seedCommercialDemoState} from '../lib/mobile-commercial-demo';
import {ensureQuotePhotoProject,quotePhotoDossier,remapQuotePhotoProjects} from '../lib/quote-photo-dossier';
import {emptyWorkspaceAliases} from '../lib/mobile-desktop-sync';
import {notifyQuoteEmailBySms,quoteEmailSmsMessage,smsMobileNumber} from '../lib/quote-email-sms';

test('le client retrouvé est enrichi avec l’adresse et le téléphone du devis sans créer de doublon',()=>{
 const incoming={phones:['06 65 78 92 84'],emails:[],addresses:[{line1:'28 rue Ferdinand Clavel',postal_code:'42100',city:'Saint-Etienne',country:'France'}]};
 const patch=customerContactPatch({phones:[],emails:['existant@example.fr'],addresses:[]},incoming);
 assert.deepEqual(patch,{phones:incoming.phones,addresses:incoming.addresses});
 assert.deepEqual(customerContactPatch({...incoming,emails:['existant@example.fr']},incoming),{});
 const partial=customerContactPatch({addresses:[{city:'Saint-Etienne',postal_code:'42100'}]},incoming);
 assert.deepEqual(partial.addresses,incoming.addresses);
 assert.equal(customerContactPatch({addresses:[{line1:'Autre adresse',city:'Lyon'}]},incoming).addresses instanceof Array,true);
});
test('un e-mail épelé lettre par lettre conserve chaque caractère, tiret et numéro',()=>{
 const text='Crée Bernard, email l o m b a r d point b e r n a r d arobase d b mail point com. Téléphone 0665789284.';
 assert.deepEqual(spokenEmailsFromTranscript(text),['lombard.bernard@dbmail.com']);
 assert.equal(normalizeVoiceTranscript(text),'Crée Bernard, email lombard.bernard@dbmail.com. Téléphone 0665789284.');
 assert.equal(normalizeSpokenEmail('l o m b a r d point b e r n a r d arobase d b mail point com'),'lombard.bernard@dbmail.com');
 assert.deepEqual(spokenEmailsFromTranscript('Mail b comme Bernard e r n a r d tiret du bas 2 arobase atelier point f r'),['bernard_2@atelier.fr']);
 assert.deepEqual(spokenEmailsFromTranscript('Bernard Lombard habite Saint Etienne, sans e-mail.'),[]);
});
test('le dossier photo est lié uniquement au devis concerné, même avec deux chantiers du même client',()=>{
 const quote=seedMobileWorkspace().quotes[0],state=seedCommercialDemoState();
 const created=ensureQuotePhotoProject({...state,projects:[]},quote,null);
 assert.equal(ensureQuotePhotoProject(created.state,quote,null).project.id,created.project.id);
 const photo={id:'ours',name:'Porte.jpg',caption:'État avant travaux',createdAt:'2026-10-08',dataUrl:'data:image/jpeg;base64,AA=='};
 const ours={...created.project,photos:[photo]},other={...ours,id:'other-project',quoteId:'other-quote',photos:[{...photo,id:'other'}]};
 const next={...state,projects:[ours,other]};
 assert.deepEqual(quotePhotoDossier(next,quote)?.photos.map(p=>p.id),['ours']);
 assert.equal(quotePhotoDossier(next,quote,[]),null);
 assert.throws(()=>quotePhotoDossier(next,quote,['other']),/indisponible/);
 const aliases=emptyWorkspaceAliases();aliases.quotes.set(quote.id,'canonical-quote');aliases.customers.set(quote.customerId,'canonical-customer');
 const mapped=remapQuotePhotoProjects(next,aliases);
 assert.deepEqual(quotePhotoDossier(mapped,{...quote,id:'canonical-quote'})?.photos.map(p=>p.id),['ours']);
 assert.equal(mapped.projects[0].customerId,'canonical-customer');
 assert.equal(mapped.projects[1].quoteId,'other-quote');
});
test('la notification utilise un numéro mobile valide et reste manuelle sans fournisseur',async()=>{
 assert.equal(smsMobileNumber('06 65 78 92 84'),'+33665789284');
 assert.equal(smsMobileNumber('0033 6 65 78 92 84'),'+33665789284');
 assert.equal(smsMobileNumber('04 77 00 00 00'),'');
 assert.equal(smsMobileNumber('+33477000000'),'');
 const saved=process.env.TWILIO_ACCOUNT_SID;delete process.env.TWILIO_ACCOUNT_SID;
 try{const message=quoteEmailSmsMessage('DEV-2026-028','CHAPET');assert.equal((await notifyQuoteEmailBySms('+33665789284',message)).status,'manual');assert.match(message,/par e-mail/);}finally{if(saved===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=saved;}
});
