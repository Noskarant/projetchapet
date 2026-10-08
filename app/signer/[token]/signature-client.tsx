'use client';
import {useEffect,useState} from 'react';
import PdfPages from '../../pdf-pages';
type State={number:string;status:string;expiresAt:string;signature:{signer_name:string;signed_at:string}|null};
export default function SignatureClient({token}:{token:string}){
 const [document,setDocument]=useState<State|null>(null),[name,setName]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const endpoint=`/api/signatures/public?token=${encodeURIComponent(token)}`;
 useEffect(()=>{let active=true;fetch(endpoint).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(active)setDocument(data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[endpoint]);
 const sign=async()=>{if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/signatures/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,signerName:name,consent})});const result=await r.json();if(!r.ok)throw new Error(result.error);const refreshed=await fetch(endpoint);if(!refreshed.ok)throw new Error('Accord enregistré. Rechargez pour consulter la preuve.');setDocument(await refreshed.json())}catch(e){setError(e instanceof Error?e.message:'Signature impossible.')}finally{setBusy(false)}};
 return <main style={{maxWidth:900,margin:'auto',padding:'24px 16px',color:'#14304b',background:'#fff',minHeight:'100dvh'}}>
  <p>MANUFEO · Devis de votre artisan</p><h1>{document?`Devis ${document.number}`:'Bon pour accord'}</h1>
  {error&&<p role="alert">{error}</p>}
  {document&&<><a href={`${endpoint}&format=pdf`} target="_blank" rel="noreferrer">Ouvrir ou télécharger le devis</a><PdfPages url={`${endpoint}&format=pdf`} title={`Devis ${document.number}`}/>
   {document.status==='signed'?<><p role="status"><strong>Bon pour accord enregistré</strong><br/>{document.signature?.signer_name} · {document.signature&&new Date(document.signature.signed_at).toLocaleString('fr-FR')}</p><a href={`${endpoint}&format=receipt`}>Télécharger la preuve d’accord</a></>:<form onSubmit={e=>{e.preventDefault();void sign()}} style={{display:'grid',gap:16,padding:'20px 0'}}>
    <label>Votre nom et prénom<input autoComplete="name" required minLength={2} maxLength={200} value={name} disabled={busy} onChange={e=>setName(e.target.value)} style={{display:'block',width:'100%',padding:12}}/></label>
    <label><input type="checkbox" required checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> J’ai lu le devis {document.number}, j’accepte son contenu et je donne mon bon pour accord par signature électronique.</label>
    <button type="submit" disabled={busy||!consent||name.trim().length<2} style={{padding:14,borderRadius:10,background:'#1769df',color:'#fff'}}>{busy?'Enregistrement…':'Signer et donner mon bon pour accord'}</button>
    <small>Signature électronique simple par lien personnel. Conservez ce lien pour retrouver le devis et la preuve d’accord.</small>
   </form>}
  </>}
 </main>;
}
