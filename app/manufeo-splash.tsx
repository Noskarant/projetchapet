"use client";

import { readCompanyProfile } from "@/lib/company-profile";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

type LoadingStage = { active: boolean; label: string };
const StartupContext = createContext<((id: string, stage: LoadingStage | null) => void) | null>(null);

/** Loading gates share one screen instead of rendering their own overlays. */
export function useStartupLoading(active: boolean, label: string) {
  const update = useContext(StartupContext);
  const id = useId();
  useEffect(() => {
    update?.(id, { active, label });
    return () => update?.(id, null);
  }, [update, id, active, label]);
}

export default function ManufeoSplash({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<Record<string, LoadingStage>>({});
  const [introDone, setIntroDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const soundPlayed = useRef(false);
  const update = useCallback((id: string, stage: LoadingStage | null) => {
    setStages(previous => {
      const next = { ...previous };
      if (stage) next[id] = stage;
      else delete next[id];
      return next;
    });
  }, []);
  const pending = useMemo(() => Object.values(stages).filter(stage => stage.active), [stages]);
  const leaving = introDone && pending.length === 0;
  const visible = !introDone || pending.length > 0 || !closed;

  useEffect(() => {
    // 1.75 seconds of logo animation + 0.25 seconds of fade = two seconds.
    const timer = window.setTimeout(() => setIntroDone(true), 1750);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) { setClosed(false); return; }
    const timer = window.setTimeout(() => setClosed(true), 250);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    let context: AudioContext | null = null;
    let active = true;
    const sound = () => {
      if (!active || soundPlayed.current) return;
      try {
        if (readCompanyProfile(window.localStorage).startupSoundEnabled === false) return;
        const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        // Browsers may require a tap. Never queue a sound for later in the app.
        if (context.state !== "running") { void context.close().catch(() => {}); context = null; return; }
        soundPlayed.current = true;
        const audio = context;
        const now = audio.currentTime;
        [523.25, 783.99].forEach((frequency, index) => {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          const start = now + index * .14;
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(.025, start + .025);
          gain.gain.exponentialRampToValueAtTime(.0001, start + .38);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start(start);
          oscillator.stop(start + .4);
          if (index === 1) oscillator.onended = () => { void audio.close().catch(() => {}); if (context === audio) context = null; };
        });
      } catch { /* Audio and local preferences can be unavailable. */ }
    };
    sound();
    window.addEventListener("pointerdown", sound);
    window.addEventListener("keydown", sound);
    const timer = window.setTimeout(() => {
      active = false;
      window.removeEventListener("pointerdown", sound);
      window.removeEventListener("keydown", sound);
    }, 2000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", sound);
      window.removeEventListener("keydown", sound);
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, []);

  return <StartupContext.Provider value={update}>
    <div style={{ display: "contents" }} inert={visible}>{children}</div>
    {visible && <div className={`manufeo-splash${leaving ? " is-leaving" : ""}${introDone ? " intro-done" : ""}`} role="status" aria-live="polite" aria-label="Ouverture de MANUFEO">
      <div className="manufeo-splash-mark">
        <div className="manufeo-splash-logo"><img src="/icon-192.webp" width="96" height="96" alt="" fetchPriority="high" /></div>
        <strong>MANUFEO</strong>
        <span className="manufeo-splash-caption">{introDone && pending.length ? pending[0].label : "Votre journée commence ici"}</span>
      </div>
    </div>}
  </StartupContext.Provider>;
}
