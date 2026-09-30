"use client";
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
type Attempt={invoice_number:string;channel:string;status:string;message:string};
export default function InvoiceDeliveryStatus(){
 useEffect(()=>{
 let attempts:Attempt[]=[],alive=true;
 const decorate=()=>{
  for(const sheet of Array.from(document.querySelectorAll<HTMLElement>('.rm-detail-sheet'))){
   if(sheet.querySelector('header small')?.textContent?.trim()!=='FACTURE')continue;
   const number=sheet.querySelector('header h2')?.textContent?.trim()||'';
   const rows=attempts.filter(item=>item.invoice_number===number);
   if(!rows.length)continue;
   let panel=sheet.querySelector<HTMLElement>('[data-invoice-auto-delivery]');
   if(!panel){panel=document.createElement('div');panel.dataset.invoiceAutoDelivery='true';panel.className='rm-auto-delivery-status';sheet.querySelector('.rm-detail-actions')?.before(panel);}
   const text=rows.map(row=>`${row.channel==='pdp'?'PDP':'Comptable'} : ${row.status==='sent'?'envoyée':row.status==='sending'?'en cours':row.status==='unknown'?'accusé à vérifier, sans renvoi automatique':`à corriger · ${row.message}`}`).join('\n');
   if(panel.textContent!==text)panel.textContent=text;
   const accountant=rows.find(row=>row.channel==='accountant'&&row.status==='sent');
   if(accountant){const state=sheet.querySelector('.rm-accountant-state strong');if(state&&state.textContent!=='Envoyée au comptable')state.textContent='Envoyée au comptable';}
  }
 };
 const load=async()=>{try{const {data}=await supabase.auth.getSession();if(!data.session)return;const response=await fetch('/api/invoices/automatic-delivery',{headers:{Authorization:`Bearer ${data.session.access_token}`}});if(!response.ok)return;const body=await response.json();if(alive){attempts=body.attempts||[];decorate();}}catch{}};
 void load();const observer=new MutationObserver(decorate);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('manufeo:invoice-delivery-updated',load);
 const timer=window.setInterval(()=>void load(),30000);
 return()=>{alive=false;observer.disconnect();window.clearInterval(timer);window.removeEventListener('manufeo:invoice-delivery-updated',load);};
 },[]);return null;
}
