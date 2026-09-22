"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import "./action-voice-experience.css";

type VoiceListeningVisualizerProps = {
  level: number;
  reactive: boolean;
  onFinish: () => void;
  onClose: () => void;
};

type VoiceProcessingVisualizerProps = {
  onClose: () => void;
};

function VoiceOrb({ processing = false }: { processing?: boolean }) {
  return (
    <span className={`ava-voice-orb ${processing ? "processing" : "listening"}`} aria-hidden="true">
      <span className="ava-voice-bloom ava-voice-bloom-a" />
      <span className="ava-voice-bloom ava-voice-bloom-b" />
      <span className="ava-voice-bloom ava-voice-bloom-c" />
      <span className="ava-voice-bloom ava-voice-bloom-d" />
      <span className="ava-voice-core" />
      <span className="ava-voice-speck ava-voice-speck-one" />
      <span className="ava-voice-speck ava-voice-speck-two" />
      <span className="ava-voice-speck ava-voice-speck-three" />
    </span>
  );
}

export function VoiceListeningVisualizer({ level, reactive, onFinish, onClose }: VoiceListeningVisualizerProps) {
  const normalized = Math.min(1, Math.max(0, level));
  const style = {
    "--ava-voice-energy": (0.08 + normalized * 0.92).toFixed(3),
  } as CSSProperties;

  return (
    <div
      className={`ava-voice-immersive ava-voice-listening ${reactive ? "reactive" : "fallback"}`}
      data-testid="voice-listening-visualizer"
      style={style}
    >
      <button
        type="button"
        className="ava-voice-fullscreen-action"
        aria-label="J’ai fini de parler"
        title="Appuyez lorsque vous avez terminé"
        onClick={onFinish}
      >
        <VoiceOrb />
        <span className="ava-voice-stop-hint">Appuyez lorsque vous avez terminé</span>
        <span className="ava-sr-only">Terminer la dictée</span>
      </button>
      <button type="button" className="ava-voice-immersive-close" aria-label="Fermer" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

export function VoiceProcessingVisualizer({ onClose }: VoiceProcessingVisualizerProps) {
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLongWait(true), 6500);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="ava-voice-immersive ava-voice-processing" data-testid="voice-processing-visualizer">
      <div className="ava-voice-processing-surface" role="status" aria-live="polite">
        <VoiceOrb processing />
        <span className="ava-voice-processing-message">
          {longWait ? "Encore un peu de patience, MANUFEO finalise…" : "MANUFEO prépare votre demande…"}
        </span>
      </div>
      <button type="button" className="ava-voice-immersive-close" aria-label="Fermer" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

export function CommandPrecisionGuide() {
  return (
    <aside className="ava-command-guide" aria-label="Conseils pour plusieurs actions">
      <div className="ava-command-guide-title">
        <Sparkles size={16} />
        <strong>Pour plusieurs actions, soyez précis</strong>
      </div>
      <p>Donnez les informations utiles pour chaque action dans la même demande.</p>
      <div className="ava-command-guide-grid">
        <span><b>Client</b> Nom ou société, téléphone, e-mail, adresse et SIRET si vous l’avez.</span>
        <span><b>Devis / facture</b> Client, prestations, quantités, unités, prix HT et TVA.</span>
        <span><b>Agenda</b> Objet, date, heure et lieu de l’intervention ou du rendez-vous.</span>
        <span><b>Autres actions</b> Fournisseur, référence, montant, destinataire ou chantier concerné selon la demande.</span>
      </div>
      <small>Une information vous manque ? Ne l’inventez pas : MANUFEO vous indiquera ce qu’il faut compléter avant validation.</small>
    </aside>
  );
}
