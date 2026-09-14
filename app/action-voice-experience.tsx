"use client";

import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import "./action-voice-experience.css";

type VoiceListeningVisualizerProps = {
  level: number;
  reactive: boolean;
};

const barPattern = [0.42, 0.62, 0.82, 1, 0.76, 0.94, 0.7, 1, 0.82, 0.62, 0.42];

export function VoiceListeningVisualizer({ level, reactive }: VoiceListeningVisualizerProps) {
  const normalized = Math.min(1, Math.max(0, level));

  function finishDictation() {
    document.querySelector<HTMLButtonElement>(".ava-overlay .ava-mic.recording")?.click();
  }

  return (
    <button
      type="button"
      className={`ava-voice-visualizer ${reactive ? "reactive" : "fallback"}`}
      aria-label="J’ai fini de parler"
      title="Cliquer pour terminer la dictée"
      data-testid="voice-listening-visualizer"
      onClick={finishDictation}
    >
      {barPattern.map((weight, index) => {
        const distanceFromCenter = Math.abs(index - (barPattern.length - 1) / 2);
        const centerBoost = 1 - distanceFromCenter / ((barPattern.length - 1) / 2);
        const barLevel = reactive
          ? Math.max(0.1, Math.min(1, 0.1 + normalized * (weight * 0.78 + centerBoost * 0.22)))
          : 0.28 + weight * 0.2;
        const style = {
          "--ava-level": barLevel.toFixed(3),
          "--ava-delay": `${index * -72}ms`,
        } as CSSProperties;
        return <span className="ava-voice-bar" style={style} key={`${weight}-${index}`} />;
      })}
      <span className="ava-sr-only">Terminer la dictée</span>
    </button>
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
