'use client';
import {useEffect,useState} from 'react';
import {smsHref} from '@/lib/document-sms';
export default function DocumentEmailSmsNotification(){
 const [sms,setSms]=useState<{phone:string;message:string}|null>(null);
 useEffect(()=>{const handler=(event:Event)=>setSms((event as CustomEvent<{phone:string;message:string}>).detail);window.addEventListener('manufeo:email-sms-ready',handler);return()=>window.removeEventListener('manufeo:email-sms-ready',handler)},[]);
 if(!sms)return null;
 return <div className="rm-commercial-backdrop" role="dialog" aria-modal="true" aria-label="Prévenir le client par SMS"><section className="rm-commercial-panel" style={{padding:24}}><h2>Devis envoyé par e-mail</h2><p>Le SMS ci-dessous est prêt pour le numéro enregistré sur la fiche client.</p><p>{sms.message}</p><a className="rm-save-button" href={smsHref(sms.phone,sms.message,/iPhone|iPad|iPod/.test(navigator.userAgent))} onClick={()=>setSms(null)}>Ouvrir Messages et envoyer le SMS</a><button type="button" onClick={()=>setSms(null)}>Fermer</button></section></div>;
}
