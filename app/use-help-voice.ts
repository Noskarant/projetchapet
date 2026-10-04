"use client";

import { useEffect, useRef, useState } from 'react';
import { transcribeManufeoQuestion } from '@/lib/action-client';
import { startHelpRecording, type HelpRecording } from '@/lib/help-voice-recorder';

export default function useHelpVoice(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle');
  const [level, setLevel] = useState(0);
  const current = useRef<{ controller: AbortController; recording: HelpRecording | null } | null>(null);
  const callbacks = useRef({ onTranscript, onError }); callbacks.current = { onTranscript, onError };

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => { cancel(false); document.removeEventListener('visibilitychange', onHidden); };
  }, []);

  function cancel(update = true) {
    const session = current.current; current.current = null;
    session?.controller.abort(); session?.recording?.cancel();
    if (update) { setPhase('idle'); setLevel(0); }
  }

  async function stop() {
    const session = current.current;
    if (!session?.recording) return;
    const recording = session.recording; session.recording = null;
    setPhase('transcribing'); setLevel(0);
    const timeout = window.setTimeout(() => session.controller.abort(), 55_000);
    try {
      const blob = await recording.stop();
      if (session.controller.signal.aborted) return;
      if (blob.size < 200) throw new Error('Enregistrement trop court. Parlez puis réessayez.');
      const text = await transcribeManufeoQuestion(blob, session.controller.signal);
      if (current.current !== session || session.controller.signal.aborted) return;
      current.current = null; setPhase('idle');
      callbacks.current.onTranscript(text);
    } catch (error) {
      if (current.current !== session) return;
      callbacks.current.onError(session.controller.signal.aborted ? 'La transcription a pris trop de temps. Réessayez.' : error instanceof Error ? error.message : 'Transcription impossible. Réessayez.');
    } finally {
      window.clearTimeout(timeout);
      if (current.current === session) { current.current = null; setPhase('idle'); }
    }
  }

  async function start() {
    if (current.current) return;
    const session = { controller: new AbortController(), recording: null as HelpRecording | null };
    current.current = session; setPhase('requesting');
    try {
      const recording = await startHelpRecording({
        signal: session.controller.signal,
        onLevel: value => { if (current.current === session) setLevel(value); },
        onEnd: reason => {
          if (current.current !== session) return;
          if (reason === 'empty') { cancel(); callbacks.current.onError('Aucune voix captée. Rapprochez-vous du micro puis réessayez.'); }
          else void stop();
        },
        onError: error => { if (current.current === session) { cancel(); callbacks.current.onError(error.message); } },
      });
      if (current.current !== session || session.controller.signal.aborted) { recording.cancel(); return; }
      session.recording = recording; setPhase('recording');
    } catch (error) {
      if (current.current !== session) return;
      current.current = null; setPhase('idle');
      callbacks.current.onError(error instanceof Error ? error.message : 'Impossible d’ouvrir le micro. Réessayez.');
    }
  }

  return { phase, level, start, stop, cancel };
}
