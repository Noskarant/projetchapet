'use client';
import {useEffect,useRef,useState} from 'react';
import type {CompanyLookupResult} from '@/lib/company-lookup';
export default function CompanySearch({name,siret,onSelect}:{name:string;siret:string;onSelect:(company:CompanyLookupResult)=>void}){
 const [mode,setMode]=useState<'name'|'siret'|'rcs'>('name'),[query,setQuery]=useState(name),[results,setResults]=useState<CompanyLookupResult[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const search=async()=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setMessage('');setResults([]);
  try{const response=await fetch(`/api/company-lookup?mode=${mode}&q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});const data=await response.json();if(controller.signal.aborted)return;if(!response.ok)throw new Error(data.error||'Recherche indisponible.');setResults(data.companies||[]);}
  catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Recherche indisponible.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 };
 return <div className="rm-company-search" style={{display:'grid',gap:8,padding:'12px 0'}}>
  <label>Rechercher une entreprise<select value={mode} onChange={event=>{request.current?.abort();setBusy(false);const next=event.target.value as typeof mode;setMode(next);setQuery(next==='name'?name:next==='siret'?siret:siret.slice(0,9));setResults([]);setMessage('');}}><option value="name">Nom de l’entreprise</option><option value="siret">SIRET</option><option value="rcs">RCS / SIREN</option></select></label>
  <input aria-label="Nom, SIRET ou RCS à rechercher" value={query} onChange={event=>{request.current?.abort();setBusy(false);setQuery(event.target.value);setResults([]);setMessage('');}} placeholder={mode==='name'?'Ex. Citya Montchalin':mode==='siret'?'14 chiffres':'Ex. RCS Lyon B 123 456 789'} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void search();}}}/>
  <button type="button" disabled={busy||!query.trim()} onClick={()=>void search()}>{busy?'Recherche…':'Rechercher l’entreprise'}</button>
  {message&&<p role="status">{message}</p>}
  {results.map(company=><button type="button" key={company.siret} onClick={()=>{onSelect(company);setResults([]);setMessage('Informations de l’entreprise récupérées.');}} style={{textAlign:'left',padding:10}}><strong>{company.companyName}</strong><br/>{company.address} · {company.postalCode} {company.city}<br/>SIRET {company.siret}</button>)}
 </div>;
}
