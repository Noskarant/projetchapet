"use client";

import type { User } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { mascotGreetingKey, mascotName } from '@/lib/mascot';
import { useStartupVisible } from './manufeo-splash';
import ManufeoMascot from './manufeo-mascot';
import ManufeoHelpDialog from './manufeo-help-dialog';

export default function ManufeoMascotWelcome({ user, canUseVoice = true }: { user: Pick<User, 'id' | 'email' | 'user_metadata'>; canUseVoice?: boolean }) {
  const startup = useStartupVisible();
  const [ready, setReady] = useState(false);
  const [obscured, setObscured] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState<'hello' | 'help' | null>(null);
  const [wave, setWave] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bottom, setBottom] = useState(160);
  const greeted = useRef(false);
  const name = mascotName(user);

  useEffect(() => {
    const inspect = () => {
      const shell = document.querySelector('.rm-shell, .worker-app');
      setReady(Boolean(shell));
      setObscured(Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], .rm-detail-sheet, .rm-commercial-panel, .ft-overlay')).some(element => element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden'));
      const dock = document.querySelector('.rm-create-dock')?.getBoundingClientRect();
      setBottom(dock && dock.height ? Math.max(150, window.innerHeight - dock.top + 12) : 160);
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    window.addEventListener('resize', inspect);
    return () => { observer.disconnect(); window.removeEventListener('resize', inspect); };
  }, []);

  useEffect(() => {
    if (startup || !ready || obscured || greeted.current) return;
    greeted.current = true;
    try {
      const key = mascotGreetingKey(user.id);
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch { /* The greeting still works when storage is unavailable. */ }
    setMessage('hello');
    setWave(value => value + 1);
  }, [startup, ready, obscured, user.id]);

  useEffect(() => {
    if (message !== 'hello') return;
    const timer = window.setTimeout(() => setMessage(current => current === 'hello' ? null : current), 6500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const openVoice = () => {
    setHelpOpen(false);
    setMessage(null);
    window.dispatchEvent(new CustomEvent('projetchapet:open-ai', { detail: { target: 'command' } }));
  };
  return <>
    {helpOpen && <ManufeoHelpDialog key={user.id} canCreate={canUseVoice} onClose={()=>setHelpOpen(false)} onCreate={openVoice}/>}
    {!startup && ready && !obscured && !dismissed && !helpOpen && <aside className="manufeo-mascot-welcome" style={{ bottom }} aria-label="Assistant MANUFEO">
    {message && <div className="manufeo-mascot-message" role="status">
      <strong>{message === 'hello' ? `Bonjour${name ? ` ${name}` : ''} !` : 'Un coup de main ?'}</strong>
      <span>{message === 'hello' ? 'Prêt pour votre journée ?' : 'Cliquez sur moi pour poser votre question.'}</span>
      {message === 'help' && <button type="button" onClick={()=>{setMessage(null);setHelpOpen(true);}}>Poser une question</button>}
      {message === 'help' && canUseVoice && <button type="button" onClick={openVoice}>Créer avec IA</button>}
      {message === 'help' && <button type="button" onClick={() => setMessage(null)}>Fermer</button>}
    </div>}
    <button type="button" className="manufeo-mascot-toggle" aria-label="Poser une question à l’agent MANUFEO" onClick={() => { setWave(value => value + 1); setMessage(null); setHelpOpen(true); }}>
      <ManufeoMascot key={wave} mood={wave ? 'hello' : 'idle'} />
    </button>
    <button type="button" className="manufeo-mascot-info" aria-label="Aide de la mascotte" onClick={() => setMessage(current => current === 'help' ? null : 'help')}>i</button>
    <button type="button" className="manufeo-mascot-hide" aria-label="Masquer la mascotte pour cette ouverture" onClick={() => setDismissed(true)}>×</button>
  </aside>}
  </>;
}
