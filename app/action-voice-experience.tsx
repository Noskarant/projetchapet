"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./action-voice-experience.css";

type VoiceListeningVisualizerProps = {
  level: number;
  activity: number;
  reactive: boolean;
  onFinish: () => void;
  onClose: () => void;
};

type VoicePreviewButtonProps = {
  onStart: () => void;
  disabled?: boolean;
};

type VoiceOverlayProps = {
  onClose: () => void;
};

type VoiceOrbMode = "preview" | "starting" | "listening" | "processing";

function VoiceOrb({ mode }: { mode: VoiceOrbMode }) {
  return (
    <span className={`ava-voice-orb ava-voice-orb-${mode}`} aria-hidden="true">
      <span className="ava-voice-color-wash" />
      <span className="ava-construction-shell ava-construction-shell-a" />
      <span className="ava-construction-shell ava-construction-shell-b" />
      <span className="ava-orbit-ring ava-orbit-ring-a"><i /></span>
      <span className="ava-orbit-ring ava-orbit-ring-b"><i /></span>
      <span className="ava-orbit-ring ava-orbit-ring-c"><i /></span>
      <span className="ava-voice-bloom ava-voice-bloom-a" />
      <span className="ava-voice-bloom ava-voice-bloom-b" />
      <span className="ava-voice-bloom ava-voice-bloom-c" />
      <span className="ava-voice-bloom ava-voice-bloom-d" />
      <span className="ava-voice-core" />
      <span className="ava-voice-filament ava-voice-filament-a" />
      <span className="ava-voice-filament ava-voice-filament-b" />
      <span className="ava-voice-filament ava-voice-filament-c" />
      <span className="ava-voice-speck ava-voice-speck-one" />
      <span className="ava-voice-speck ava-voice-speck-two" />
      <span className="ava-voice-speck ava-voice-speck-three" />
      <span className="ava-voice-speck ava-voice-speck-four" />
      <span className="ava-build-sweep" />
    </span>
  );
}

export function VoicePreviewButton({ onStart, disabled = false }: VoicePreviewButtonProps) {
  return (
    <button
      type="button"
      className="ava-voice-preview"
      data-testid="voice-preview-button"
      onClick={onStart}
      disabled={disabled}
      aria-label="Démarrer la dictée vocale"
    >
      <span className="ava-voice-preview-stage">
        <VoiceOrb mode="preview" />
      </span>
      <span className="ava-voice-preview-copy">
        <strong>Appuyez pour parler</strong>
        <small>MANUFEO vous écoute et prépare ensuite votre demande.</small>
      </span>
    </button>
  );
}

export function VoiceStartingVisualizer({ onClose }: VoiceOverlayProps) {
  return (
    <div className="ava-voice-immersive ava-voice-starting" data-testid="voice-starting-visualizer">
      <div className="ava-voice-processing-surface" role="status" aria-live="polite">
        <VoiceOrb mode="starting" />
        <span className="ava-voice-processing-message">Activation du micro…</span>
      </div>
      <button type="button" className="ava-voice-immersive-close" aria-label="Fermer" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

export function VoiceListeningVisualizer({ level, activity, reactive, onFinish, onClose }: VoiceListeningVisualizerProps) {
  const normalized = Math.min(1, Math.max(0, level));
  const normalizedActivity = Math.min(1, Math.max(0, activity));
  const previousLevel = useRef(0);
  const cadence = Math.min(1, normalizedActivity * 0.72 + Math.abs(normalized - previousLevel.current) * 1.9);
  previousLevel.current = normalized;

  const style = {
    "--ava-voice-energy": (0.08 + normalized * 0.92).toFixed(3),
    "--ava-voice-cadence": (0.08 + cadence * 0.92).toFixed(3),
    "--ava-react-speed": `${(3.15 - cadence * 1.35).toFixed(2)}s`,
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
        <VoiceOrb mode="listening" />
        <span className="ava-voice-listening-state">MANUFEO écoute</span>
        <span className="ava-voice-stop-hint">Appuyez lorsque vous avez terminé</span>
        <span className="ava-sr-only">Terminer la dictée</span>
      </button>
      <button type="button" className="ava-voice-immersive-close" aria-label="Fermer" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

export function VoiceProcessingVisualizer({ onClose }: VoiceOverlayProps) {
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLongWait(true), 6500);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className={`ava-voice-immersive ava-voice-processing ${longWait ? "long-wait" : ""}`} data-testid="voice-processing-visualizer">
      <div className="ava-voice-processing-surface" role="status" aria-live="polite">
        <VoiceOrb mode="processing" />
        <span className="ava-voice-processing-message">
          {longWait ? "Encore un peu de patience, MANUFEO finalise…" : "MANUFEO construit votre demande…"}
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
