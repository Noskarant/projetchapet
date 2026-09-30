"use client";

import { readCompanyProfile } from "@/lib/company-profile";
import { useEffect, useState } from "react";

export default function ManufeoSplash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sound = () => {
      if (window.sessionStorage.getItem("manufeo:startup-sound") === "1" || readCompanyProfile(window.localStorage).startupSoundEnabled === false) return;
      try {
        const context = new AudioContext();
        if (context.state !== "running") { void context.close(); return; }
        window.sessionStorage.setItem("manufeo:startup-sound", "1");
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = "sine"; oscillator.frequency.setValueAtTime(660, context.currentTime);
        oscillator.frequency.linearRampToValueAtTime(880, context.currentTime + .12);
        gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.025,context.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.25);
        oscillator.connect(gain);gain.connect(context.destination);oscillator.start();oscillator.stop(context.currentTime+.26);oscillator.onended=()=>void context.close();
      } catch { /* Audio may be unavailable or blocked by the browser. */ }
    };
    sound();
    window.addEventListener("pointerdown",sound,{once:true});
    const timer = window.setTimeout(() => setVisible(false), 650);
    return () => { window.clearTimeout(timer); window.removeEventListener("pointerdown",sound); };
  }, []);
  if (!visible) return null;
  return <div className="manufeo-splash" role="status" aria-label="Ouverture de MANUFEO"><div className="manufeo-splash-mark"><img src="/icon-192.webp" alt="" /><strong>MANUFEO</strong></div></div>;
}
