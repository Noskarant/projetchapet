"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUp, Loader2, Mic, Square, X } from 'lucide-react';
import { askManufeoQuestion } from '@/lib/action-client';
import { getActiveOrganizationId } from '@/lib/project-chapet';
import type { HelpMessage } from '@/lib/assistant-help';
import ManufeoMascot from './manufeo-mascot';
import useHelpVoice from './use-help-voice';
import './manufeo-help-dialog.css';

const suggestions=[{label:'Importer un devis',question:'Comment importer un devis fournisseur ?'},{label:'Ajouter une marge',question:'Comment ajouter 30 % de marge ?'},{label:'Envoyer une facture',question:'Comment envoyer une facture ?'}];

export default function ManufeoHelpDialog({onClose,onCreate,canCreate}:{onClose:()=>void;onCreate:()=>void;canCreate:boolean}) {
  const [question,setQuestion]=useState('');
  const [messages,setMessages]=useState<HelpMessage[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pendingQuestion,setPendingQuestion]=useState('');
  const [viewport,setViewport]=useState<{height:number;top:number}|null>(null);
  const busyRef=useRef(false);
  const panel=useRef<HTMLElement>(null);
  const input=useRef<HTMLTextAreaElement>(null);
  const scroll=useRef<HTMLDivElement>(null);
  const controller=useRef<AbortController|null>(null);
  const onCloseRef=useRef(onClose); onCloseRef.current=onClose;
  const voice=useHelpVoice(text=>{setQuestion(text);void ask(text);},setError);
  const locked=busy||voice.phase!=='idle';

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    // Keep the keyboard closed on touch screens until the artisan taps the field.
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
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
  useEffect(()=>{
    const visible=window.visualViewport;
    const update=()=>setViewport({height:visible?.height||window.innerHeight,top:visible?.offsetTop||0});
    update();visible?.addEventListener('resize',update);visible?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{visible?.removeEventListener('resize',update);visible?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'});},[messages,busy,error,viewport]);

  async function ask(value:string) {
    const text=value.trim();
    if(!text||busyRef.current)return;
    busyRef.current=true;input.current?.blur();
    const pending=new AbortController();controller.current=pending;
    const timeout=window.setTimeout(()=>pending.abort(),32_000);
    setBusy(true);setError('');setPendingQuestion(text);
    try {
      const organizationId=await getActiveOrganizationId();
      const recent=messages.slice(-8);
      // Keep the latest complete exchanges within the server's bounded context.
      while(recent.reduce((sum,message)=>sum+message.content.length,0)>12_000)recent.splice(0,2);
      const result=await askManufeoQuestion(organizationId,text,recent,pending.signal);
      if(pending.signal.aborted)return;
      if(typeof result.answer!=='string'||!result.answer.trim())throw new Error('La réponse est vide. Réessayez.');
      setMessages(current=>[...current,{role:'user',content:text},{role:'assistant',content:result.answer}]);
      setQuestion('');
    }catch(cause){
      if(controller.current!==pending)return;
      setQuestion(text);
      setError(cause instanceof DOMException&&cause.name==='AbortError'?'La réponse a pris trop de temps. Réessayez.':cause instanceof Error?cause.message:'L’agent est indisponible. Réessayez.');
    }finally{
      window.clearTimeout(timeout);
      if(controller.current===pending){controller.current=null;busyRef.current=false;setBusy(false);setPendingQuestion('');}
    }
  }

  const style:CSSProperties|undefined=viewport?{top:viewport.top,height:viewport.height,bottom:'auto'}:undefined;
  const voiceLabel=voice.phase==='recording'?'Terminer et envoyer':voice.phase==='requesting'?'Ouverture du micro…':voice.phase==='transcribing'?'Je vous ai entendu…':'Parler à MANUFEO';
  return <div className="manufeo-help-backdrop" style={style} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={panel} className="manufeo-help-panel" role="dialog" aria-modal="true" aria-labelledby="manufeo-help-title">
      <header><ManufeoMascot mood={voice.phase==='recording'?'listening':locked?'thinking':'idle'} level={voice.level}/><div><small>VOTRE ASSISTANT MANUFEO</small><h2 id="manufeo-help-title">Posez votre question</h2></div><button type="button" aria-label="Fermer les questions à l’agent" onClick={onClose}><X size={22}/></button></header>
      <div className="manufeo-help-messages" ref={scroll} role="log" aria-live="polite" aria-label="Conversation avec MANUFEO">
        {!messages.length&&!pendingQuestion&&<div className="manufeo-help-intro"><ManufeoMascot mood={voice.phase==='recording'?'listening':'hello'} level={voice.level}/><h3>Comment puis-je vous aider ?</h3><p>Parlez-moi ou écrivez votre question.</p><div className="manufeo-help-suggestions">{suggestions.map(({label,question:text})=><button key={text} type="button" disabled={locked} aria-label={text} onClick={()=>{setQuestion(text);void ask(text);}}>{label}<ArrowUp size={14}/></button>)}</div></div>}
        {messages.map((message,index)=><div key={index} className={`manufeo-help-message manufeo-help-${message.role}`}><strong>{message.role==='user'?'Vous':'MANUFEO'}</strong><p>{message.content}</p></div>)}
        {pendingQuestion&&<div className="manufeo-help-message manufeo-help-user"><strong>Vous</strong><p>{pendingQuestion}</p></div>}
        {busy&&<p className="manufeo-help-status" role="status"><Loader2 size={16}/> Je prépare ma réponse…</p>}
        {error&&<p className="manufeo-help-error" role="alert">{error}</p>}
      </div>
      <form onSubmit={event=>{event.preventDefault();if(!locked)void ask(question);}}>
        <div className="manufeo-help-voice-row">
          <button type="button" className={`manufeo-help-voice${voice.phase==='recording'?' is-recording':''}`} disabled={busy||voice.phase==='requesting'||voice.phase==='transcribing'} aria-label={voiceLabel} onClick={()=>{setError('');input.current?.blur();if(voice.phase==='recording')void voice.stop();else void voice.start();}}>
            {voice.phase==='recording'?<Square size={18}/>:voice.phase==='requesting'||voice.phase==='transcribing'?<Loader2 size={20}/>:<Mic size={21}/>}
            <span>{voiceLabel}</span>
            {voice.phase==='recording'&&<span className="manufeo-help-wave" style={{'--help-level':voice.level} as CSSProperties} aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i}/>)}</span>}
          </button>
          {voice.phase!=='idle'&&<button type="button" className="manufeo-help-cancel" aria-label="Annuler la question vocale" onClick={()=>voice.cancel()}><X size={18}/></button>}
        </div>
        <small className="manufeo-help-voice-hint">{voice.phase==='recording'?'Je vous écoute. Un court silence envoie votre question.':voice.phase==='transcribing'?'Je transforme votre voix en question…':'À la fin de votre phrase, la question part automatiquement.'}</small>
        <div className="manufeo-help-composer">
          <label htmlFor="manufeo-help-question">Votre question</label>
          <textarea ref={input} id="manufeo-help-question" value={question} maxLength={2000} rows={1} placeholder="Ou écrivez votre question…" disabled={locked} onChange={event=>setQuestion(event.target.value)}/>
          <button type="submit" className="manufeo-help-send" aria-label="Poser la question" disabled={locked||!question.trim()}><ArrowUp size={20}/></button>
        </div>
        {canCreate&&<button type="button" className="manufeo-help-create" disabled={locked} onClick={onCreate}>Créer avec IA <ArrowUp size={12}/></button>}
      </form>
    </section>
  </div>;
}
