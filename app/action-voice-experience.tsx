"use client";

import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import "./action-voice-experience.css";

type VoiceListeningVisualizerProps = {
  level: number;
  reactive: boolean;
};

const barPattern = [0.58, 0.78, 0.94, 1, 0.86, 0.7, 0.52];

export function VoiceListeningVisualizer({ level, reactive }: VoiceListeningVisualizerProps) {
  const normalized = Math.min(1, Math.max(0, level));

  return (
    <div
      className={`ava-voice-visualizer ${reactive ? "reactive" : "fallback"}`}
      aria-hidden="true"
      data-testid="voice-listening-visualizer"
    >
      {barPattern.map((weight, index) => {
        const barLevel = reactive
          ? Math.max(0.12, Math.min(1, 0.12 + normalized * weight))
          : 0.36 + weight * 0.18;
        const style = {
          "--ava-level": barLevel.toFixed(3),
          "--ava-delay": `${index * -95}ms`,
        } as CSSProperties;
        return <span className="ava-voice-bar" style={style} key={`${weight}-${index}`} />;
      })}
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
