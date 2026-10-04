"use client";

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { askManufeoQuestion } from '@/lib/action-client';
import { getActiveOrganizationId } from '@/lib/project-chapet';
import type { HelpMessage } from '@/lib/assistant-help';
import ManufeoMascot from './manufeo-mascot';
import './manufeo-help-dialog.css';

const suggestions=['Comment importer un devis fournisseur ?','Comment ajouter 30 % de marge ?','Comment envoyer une facture ?'];

export default function ManufeoHelpDialog({onClose,onCreate,canCreate}:{onClose:()=>void;onCreate:()=>void;canCreate:boolean}) {
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<HelpMessage[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const panel=useRef<HTMLElement>(null);
  const input=useRef<HTMLTextAreaElement>(null);
  const scroll=useRef<HTMLDivElement>(null);
  const controller=useRef<AbortController|null>(null);
  const onCloseRef=useRef(onClose); onCloseRef.current=onClose;

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden'; input.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onCloseRef.current();}
      if(event.key!=='Tab')return;
      const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), [tabindex="0"]')||[]);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);
    return()=>{controller.current?.abort();controller.current=null;document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  useEffect(()=>{scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'});},[messages,busy,error]);

  async function ask(value:string) {
    const text=value.trim();
    if(!text||busy)return;
    const pending=new AbortController();controller.current=pending;
    const timeout=window.setTimeout(()=>pending.abort(),32_000);
    setBusy(true);setError('');
    try {
      const organizationId=await getActiveOrganizationId();
      const recent=messages.slice(-8);
      // Keep the latest complete exchanges within the server's bounded context.
      while(recent.reduce((sum,message)=>sum+message.content.length,0)>12_000)recent.splice(0,2);
      const result=await askManufeoQuestion(organizationId,text,recent,pending.signal);
      if(pending.signal.aborted)return;
      if(typeof result.answer!=='string'||!result.answer.trim())throw new Error('La réponse est vide. Réessayez.');
      setMessages(current=>[...current,{role:'user',content:text},{role:'assistant',content:result.answer}]);
      setQuestion('');input.current?.focus();
    }catch(cause){
      if(controller.current!==pending)return;
      setQuestion(text);
      setError(cause instanceof DOMException&&cause.name==='AbortError'?'La réponse a pris trop de temps. Réessayez.':cause instanceof Error?cause.message:'L’agent est indisponible. Réessayez.');
    }finally{
      window.clearTimeout(timeout);
      if(controller.current===pending){controller.current=null;setBusy(false);}
    }
  }

  return <div className="manufeo-help-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={panel} className="manufeo-help-panel" role="dialog" aria-modal="true" aria-labelledby="manufeo-help-title">
      <header><ManufeoMascot mood={busy?'thinking':'idle'}/><div><small>MANUFEO</small><h2 id="manufeo-help-title">Posez votre question</h2></div><button type="button" aria-label="Fermer les questions à l’agent" onClick={onClose}><X size={22}/></button></header>
      <div className="manufeo-help-messages" ref={scroll} role="log" aria-live="polite" aria-label="Conversation avec MANUFEO">
        {!messages.length&&<div className="manufeo-help-intro"><MessageCircle size={24}/><p>Une question sur votre devis ou sur MANUFEO ? Je vous guide.</p><small>Pour créer ou envoyer un document, utilisez les actions du logiciel.</small><div className="manufeo-help-suggestions">{suggestions.map(text=><button key={text} type="button" disabled={busy} onClick={()=>{setQuestion(text);void ask(text);}}>{text}</button>)}</div></div>}
        {messages.map((message,index)=><div key={index} className={`manufeo-help-message manufeo-help-${message.role}`}><strong>{message.role==='user'?'Vous':'MANUFEO'}</strong><p>{message.content}</p></div>)}
        {busy&&<p className="manufeo-help-status" role="status">Je prépare ma réponse…</p>}
        {error&&<p className="manufeo-help-error" role="alert">{error}</p>}
      </div>
      <form onSubmit={event=>{event.preventDefault();void ask(question);}}>
        <label htmlFor="manufeo-help-question">Votre question</label>
        <textarea ref={input} id="manufeo-help-question" value={question} maxLength={2000} rows={3} placeholder="Écrivez votre question…" disabled={busy} onChange={event=>setQuestion(event.target.value)}/>
        <div className="manufeo-help-actions">{canCreate&&<button type="button" className="manufeo-help-create" disabled={busy} onClick={onCreate}>Créer avec IA</button>}<button type="submit" className="manufeo-help-send" disabled={busy||!question.trim()}><Send size={16}/>{busy?'Réponse en cours…':'Poser la question'}</button></div>
      </form>
    </section>
  </div>;
}
