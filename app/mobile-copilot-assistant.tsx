"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Mic,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CopilotProposal, CopilotUnit } from "@/lib/copilot/types";

type Stage = "input" | "loading" | "review" | "error";

type CopilotApiResponse = {
  provider?: string;
  mode?: string;
  proposal?: CopilotProposal;
  ready_to_create_draft?: boolean;
  warning?: string | null;
  error?: string;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionLike;

function speechConstructor() {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function unitForQuote(unit: CopilotUnit) {
  if (unit === "m2") return "m²";
  if (unit === "unite") return "u";
  if (unit === "ml") return "ml";
  if (unit === "m") return "m";
  if (unit === "l") return "L";
  if (unit === "h") return "h";
  if (unit === "jour") return "jour";
  return "forfait";
}

function proposalNotes(proposal: CopilotProposal) {
  const sections = [
    "Proposition préparée par le copilote métier. Vérification humaine obligatoire avant envoi.",
    proposal.interpretation.assumptions.length
      ? `Hypothèses à confirmer :\n- ${proposal.interpretation.assumptions.join("\n- ")}`
      : "",
    proposal.interpretation.potentialOmissions.length
      ? `Points à vérifier :\n- ${proposal.interpretation.potentialOmissions.join("\n- ")}`
      : "",
    `Rentabilité prévisionnelle : ${proposal.metrics.marginRate} % de marge estimée sur la base des coûts renseignés.`,
  ];
  return sections.filter(Boolean).join("\n\n");
}

export default function MobileCopilotAssistant() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("input");
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState<CopilotProposal | null>(null);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("");
  const [recording, setRecording] = useState(false);
  const [genericConfirmed, setGenericConfirmed] = useState(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const hasGenericEstimates = useMemo(
    () => proposal?.lines.some((line) => line.source === "template_default") ?? false,
    [proposal],
  );

  function stopRecognition() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  }

  function close() {
    requestRef.current?.abort();
    requestRef.current = null;
    stopRecognition();
    setOpen(false);
  }

  function reset() {
    requestRef.current?.abort();
    requestRef.current = null;
    stopRecognition();
    setStage("input");
    setDescription("");
    setProposal(null);
    setMessage("");
    setProvider("");
    setGenericConfirmed(false);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    requestRef.current?.abort();
    recognitionRef.current?.stop();
  }, []);

  function startOrStopDictation() {
    if (recording) {
      stopRecognition();
      return;
    }

    const Constructor = speechConstructor();
    if (!Constructor) {
      setMessage("La dictée du navigateur n’est pas disponible. Écrivez la description du chantier.");
      return;
    }

    const recognition = new Constructor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setDescription((current) => `${current} ${text}`.trim());
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setRecording(false);
      setMessage(event.error
        ? `Dictée interrompue : ${event.error}. Vous pouvez continuer au clavier.`
        : "Dictée interrompue. Vous pouvez continuer au clavier.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setRecording(false);
    };
    recognitionRef.current = recognition;
    setMessage("");
    setRecording(true);
    recognition.start();
  }

  async function analyse() {
    const text = description.trim();
    if (!text) {
      setMessage("Décrivez le chantier avant de lancer l’analyse.");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setStage("loading");
    setMessage("");
    setProposal(null);
    setGenericConfirmed(false);

    try {
      const response = await fetch("/api/copilot/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
        signal: controller.signal,
      });
      const result = await response.json() as CopilotApiResponse;
      if (!response.ok || !result.proposal) {
        throw new Error(result.error || "Le chantier n’a pas pu être préparé.");
      }
      setProposal(result.proposal);
      setProvider(result.provider || "moteur local");
      setMessage(result.warning || "");
      setStage("review");
    } catch (error) {
      setStage("error");
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "L’analyse a pris trop de temps. Réessayez dans un instant."
        : error instanceof Error
          ? error.message
          : "Le chantier n’a pas pu être préparé.");
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function openQuoteDraft() {
    if (!proposal || proposal.status !== "ready_for_review") return;
    if (hasGenericEstimates && !genericConfirmed) {
      setMessage("Confirmez que les tarifs génériques seront vérifiés dans le devis.");
      return;
    }

    const event = new CustomEvent("projetchapet:ai-apply", {
      cancelable: true,
      detail: {
        target: "quote",
        data: {
          customer_hint: proposal.interpretation.customerHint,
          title: proposal.interpretation.title,
          notes: proposalNotes(proposal),
          items: proposal.lines.map((line) => ({
            label: line.label,
            description: `${line.description}\nOrigine : ${line.sourceLabel}`,
            quantity: line.quantity,
            unit: unitForQuote(line.unit),
            unit_price: line.unitPriceHt,
            tax_rate: line.taxRate,
          })),
        },
      },
    });

    const accepted = window.dispatchEvent(event);
    if (!accepted) {
      setMessage("Le client doit être reconnu dans CHAPET avant d’ouvrir le devis.");
      return;
    }
    close();
  }

  const ready = proposal?.status === "ready_for_review";
  const canOpenDraft = Boolean(ready && (!hasGenericEstimates || genericConfirmed));

  return (
    <>
      <button
        type="button"
        className="mcp-launcher"
        aria-label="Ouvrir le copilote chantier"
        onClick={() => { reset(); setOpen(true); }}
      >
        <Sparkles size={19} />
        <span>Copilote chantier</span>
      </button>

      {open && (
        <div className="mcp-overlay" role="dialog" aria-modal="true" aria-label="Copilote chantier">
          <section className="mcp-panel">
            <header className="mcp-header">
              <div>
                <small>COPILOTE MÉTIER</small>
                <h2>Décrivez votre chantier</h2>
              </div>
              <button type="button" onClick={close} aria-label="Fermer le copilote"><X size={22} /></button>
            </header>

            {(stage === "input" || stage === "error") && (
              <div className="mcp-input-step">
                <div className="mcp-intro">
                  <span><Sparkles size={23} /></span>
                  <div>
                    <strong>Parlez comme sur le chantier</strong>
                    <small>Le copilote comprend les travaux, puis le moteur calcule les lignes et la marge.</small>
                  </div>
                </div>
                <label htmlFor="mcp-description">Description du chantier</label>
                <textarea
                  id="mcp-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex. Chez SCI Bellevue, je dois repeindre un appartement de 65 m² avec les plafonds, quelques fissures et quatre portes."
                  rows={7}
                />
                <button
                  type="button"
                  className={`mcp-dictation ${recording ? "recording" : ""}`}
                  onClick={startOrStopDictation}
                >
                  {recording ? <Square size={18} /> : <Mic size={20} />}
                  {recording ? "Arrêter la dictée" : "Dicter la description"}
                </button>
                {message && <div className="mcp-message" role="alert">{message}</div>}
                <button type="button" className="mcp-primary" onClick={() => void analyse()}>
                  <Sparkles size={19} /> Analyser le chantier
                </button>
              </div>
            )}

            {stage === "loading" && (
              <div className="mcp-loading" aria-live="polite">
                <Loader2 size={38} className="mcp-spin" />
                <strong>Compréhension du chantier…</strong>
                <span>Les prix et les calculs restent traités par le moteur métier.</span>
              </div>
            )}

            {stage === "review" && proposal && (
              <div className="mcp-review">
                <div className={`mcp-status ${ready ? "ready" : "warning"}`}>
                  {ready ? <CheckCircle2 size={23} /> : <AlertTriangle size={23} />}
                  <div>
                    <strong>{ready ? "Proposition prête à vérifier" : "Informations à compléter"}</strong>
                    <small>Compréhension : {Math.round(proposal.interpretation.confidence * 100)} % · {provider}</small>
                  </div>
                </div>
                {message && <div className="mcp-message" role="status">{message}</div>}

                <section className="mcp-card">
                  <h3>Données comprises</h3>
                  {proposal.interpretation.understoodData.length ? (
                    <ul>{proposal.interpretation.understoodData.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : <p>Aucune donnée chiffrée fiable n’a encore été comprise.</p>}
                </section>

                <section className="mcp-card">
                  <h3>Prestations proposées</h3>
                  <div className="mcp-lines">
                    {proposal.lines.map((line) => (
                      <article key={line.code}>
                        <div>
                          <strong>{line.label}</strong>
                          <small>{line.quantity} {unitForQuote(line.unit)} · TVA {line.taxRate} %</small>
                          <em className={line.source === "company_catalog" ? "company" : "generic"}>{line.sourceLabel}</em>
                        </div>
                        <span>{euro(line.saleTotalHt)} HT</span>
                      </article>
                    ))}
                  </div>
                </section>

                {proposal.interpretation.assumptions.length > 0 && (
                  <section className="mcp-card mcp-assumptions">
                    <h3>Hypothèses à confirmer</h3>
                    <ul>{proposal.interpretation.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                )}

                {proposal.interpretation.potentialOmissions.length > 0 && (
                  <section className="mcp-card">
                    <h3>Postes potentiellement oubliés</h3>
                    <ul>{proposal.interpretation.potentialOmissions.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                )}

                {proposal.questions.length > 0 && (
                  <section className="mcp-card mcp-questions">
                    <h3>À vérifier avant validation</h3>
                    <ul>{proposal.questions.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                )}

                <section className="mcp-profitability" aria-label="Rentabilité prévisionnelle">
                  <div><span>Total HT</span><strong>{euro(proposal.metrics.saleTotalHt)}</strong></div>
                  <div><span>Main-d’œuvre estimée</span><strong>{proposal.metrics.labourHours} h</strong></div>
                  <div><span>Coût estimé</span><strong>{euro(proposal.metrics.estimatedCost)}</strong></div>
                  <div><span>Marge estimée</span><strong>{euro(proposal.metrics.estimatedMargin)} · {proposal.metrics.marginRate} %</strong></div>
                  {proposal.metrics.marginAlert && <p><AlertTriangle size={17} />{proposal.metrics.marginAlert}</p>}
                </section>

                {hasGenericEstimates && ready && (
                  <label className="mcp-confirm">
                    <input
                      type="checkbox"
                      checked={genericConfirmed}
                      onChange={(event) => setGenericConfirmed(event.target.checked)}
                    />
                    <span>Je vérifierai les tarifs génériques dans le devis avant tout envoi.</span>
                  </label>
                )}

                {!ready && proposal.questions.length > 0 && (
                  <div className="mcp-blocked">
                    <AlertTriangle size={19} /> Complétez la description avant de créer le brouillon.
                  </div>
                )}

                {message && stage === "review" && !ready && <div className="mcp-message" role="alert">{message}</div>}
                <button
                  type="button"
                  className="mcp-primary"
                  disabled={!canOpenDraft}
                  onClick={openQuoteDraft}
                >
                  <FileText size={19} /> Ouvrir le devis brouillon
                </button>
                <button
                  type="button"
                  className="mcp-secondary"
                  onClick={() => { setStage("input"); setProposal(null); setMessage(""); setGenericConfirmed(false); }}
                >
                  Corriger la description
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      <style>{`
        .mcp-launcher {
          position: fixed;
          z-index: 4200;
          right: 16px;
          bottom: calc(84px + env(safe-area-inset-bottom));
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 15px;
          border: 0;
          border-radius: 999px;
          background: #163f6b;
          color: #fff;
          box-shadow: 0 10px 28px rgba(15, 47, 82, .28);
          font: 800 13px/1 Arial, sans-serif;
        }
        .mcp-overlay {
          position: fixed;
          z-index: 100000;
          inset: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(9, 24, 40, .58);
          backdrop-filter: blur(3px);
        }
        .mcp-panel {
          width: min(100%, 620px);
          max-height: 94dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-radius: 24px 24px 0 0;
          background: #f4f7fa;
          color: #102a43;
          box-shadow: 0 -18px 60px rgba(9, 24, 40, .3);
          font-family: Arial, sans-serif;
        }
        .mcp-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 18px 15px;
          border-bottom: 1px solid #dce4ec;
          background: #fff;
        }
        .mcp-header small { display: block; margin-bottom: 4px; color: #3674a9; font-size: 11px; font-weight: 900; letter-spacing: .09em; }
        .mcp-header h2 { margin: 0; font-size: 21px; line-height: 1.15; }
        .mcp-header button { width: 40px; height: 40px; border: 0; border-radius: 50%; background: #edf2f7; color: #102a43; }
        .mcp-input-step, .mcp-review {
          overflow-y: auto;
          padding: 18px;
          padding-bottom: calc(22px + env(safe-area-inset-bottom));
        }
        .mcp-intro { display: flex; gap: 12px; padding: 14px; margin-bottom: 17px; border-radius: 16px; background: #eaf3fb; }
        .mcp-intro > span { width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border-radius: 13px; background: #fff; color: #256797; }
        .mcp-intro strong, .mcp-intro small { display: block; }
        .mcp-intro strong { margin: 2px 0 4px; font-size: 15px; }
        .mcp-intro small { color: #52677b; line-height: 1.35; }
        .mcp-input-step label { display: block; margin: 0 0 8px; font-size: 13px; font-weight: 800; }
        .mcp-input-step textarea { box-sizing: border-box; width: 100%; resize: vertical; min-height: 145px; padding: 14px; border: 1px solid #bdcbd8; border-radius: 14px; background: #fff; color: #102a43; font: 15px/1.45 Arial, sans-serif; outline: none; }
        .mcp-input-step textarea:focus { border-color: #2f76ad; box-shadow: 0 0 0 3px rgba(47, 118, 173, .13); }
        .mcp-dictation { width: 100%; min-height: 46px; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 9px; border: 1px solid #b8c8d6; border-radius: 13px; background: #fff; color: #214d73; font-weight: 800; }
        .mcp-dictation.recording { border-color: #bb3434; background: #fff1f1; color: #a51e1e; }
        .mcp-primary, .mcp-secondary { width: 100%; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 9px; border-radius: 14px; font: 800 15px/1 Arial, sans-serif; }
        .mcp-primary { margin-top: 14px; border: 0; background: #176b4e; color: #fff; }
        .mcp-primary:disabled { background: #a8b7b1; cursor: not-allowed; }
        .mcp-secondary { margin-top: 9px; border: 1px solid #bdcbd8; background: #fff; color: #25445f; }
        .mcp-message { margin-top: 12px; padding: 11px 13px; border-radius: 11px; background: #fff4d7; color: #6a4b00; font-size: 13px; font-weight: 700; line-height: 1.4; }
        .mcp-loading { min-height: 330px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px; text-align: center; }
        .mcp-loading strong { font-size: 18px; }
        .mcp-loading span { max-width: 330px; color: #607487; font-size: 14px; line-height: 1.4; }
        .mcp-spin { animation: mcp-spin .9s linear infinite; color: #24704f; }
        @keyframes mcp-spin { to { transform: rotate(360deg); } }
        .mcp-status { display: flex; gap: 11px; align-items: center; padding: 14px; margin-bottom: 13px; border-radius: 15px; }
        .mcp-status.ready { background: #e1f3e9; color: #155d42; }
        .mcp-status.warning { background: #fff0d5; color: #765000; }
        .mcp-status strong, .mcp-status small { display: block; }
        .mcp-status strong { margin-bottom: 3px; font-size: 15px; }
        .mcp-status small { opacity: .8; font-size: 12px; }
        .mcp-card { margin-top: 12px; padding: 15px; border: 1px solid #dce5ed; border-radius: 16px; background: #fff; }
        .mcp-card h3 { margin: 0 0 11px; font-size: 15px; }
        .mcp-card p { margin: 0; color: #607487; font-size: 13px; line-height: 1.45; }
        .mcp-card ul { margin: 0; padding-left: 19px; color: #334e68; font-size: 13px; line-height: 1.48; }
        .mcp-card li + li { margin-top: 5px; }
        .mcp-assumptions { border-color: #dfca91; background: #fffaf0; }
        .mcp-questions { border-color: #c8d9e8; background: #f5faff; }
        .mcp-lines { display: grid; gap: 10px; }
        .mcp-lines article { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid #edf1f5; }
        .mcp-lines article:last-child { padding-bottom: 0; border-bottom: 0; }
        .mcp-lines article > div { min-width: 0; }
        .mcp-lines strong, .mcp-lines small, .mcp-lines em { display: block; }
        .mcp-lines article > div > strong { font-size: 13px; line-height: 1.3; }
        .mcp-lines small { margin-top: 3px; color: #64788b; font-size: 12px; }
        .mcp-lines em { width: fit-content; margin-top: 6px; padding: 4px 7px; border-radius: 999px; font-size: 10px; font-style: normal; font-weight: 800; }
        .mcp-lines em.generic { background: #fff1d6; color: #795300; }
        .mcp-lines em.company { background: #e1f3e9; color: #155d42; }
        .mcp-lines article > span { flex: 0 0 auto; color: #173f61; font-size: 13px; font-weight: 900; }
        .mcp-profitability { margin-top: 12px; padding: 15px; border-radius: 16px; background: #123b60; color: #fff; }
        .mcp-profitability > div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.13); }
        .mcp-profitability > div:last-of-type { border-bottom: 0; }
        .mcp-profitability span { font-size: 13px; opacity: .82; }
        .mcp-profitability strong { text-align: right; font-size: 13px; }
        .mcp-profitability p { display: flex; gap: 7px; align-items: flex-start; margin: 11px 0 0; padding: 10px; border-radius: 10px; background: rgba(255, 205, 93, .15); color: #ffe0a0; font-size: 12px; font-weight: 700; line-height: 1.35; }
        .mcp-confirm { display: flex; gap: 10px; align-items: flex-start; margin-top: 13px; padding: 13px; border: 1px solid #ddc786; border-radius: 13px; background: #fff9e9; color: #533e07; font-size: 13px; font-weight: 700; line-height: 1.4; }
        .mcp-confirm input { width: 20px; height: 20px; flex: 0 0 20px; margin: 0; accent-color: #176b4e; }
        .mcp-blocked { display: flex; gap: 8px; align-items: flex-start; margin-top: 13px; padding: 12px; border-radius: 12px; background: #fff0d5; color: #765000; font-size: 13px; font-weight: 800; line-height: 1.4; }
        @media (min-width: 621px) {
          .mcp-panel { margin-bottom: 18px; border-radius: 24px; }
        }
      `}</style>
    </>
  );
}
