"use client";

import {
  CalendarDays,
  Check,
  FileText,
  Loader2,
  Mail,
  Mic,
  ReceiptText,
  ShoppingCart,
  Square,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  executeVoiceActions,
  planVoiceActions,
  type ActionExecutionResult,
  type ActionProposalView,
} from "@/lib/action-client";
import type { VoiceActionTarget } from "@/lib/action-planner";
import { getActiveOrganizationId } from "@/lib/project-chapet";
import { CommandPrecisionGuide, VoiceListeningVisualizer } from "./action-voice-experience";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";
import "./action-voice-assistant.css";

type Stage = "choose" | "ready" | "requesting" | "recording" | "transcribing" | "analysing" | "review" | "executing" | "success" | "error";

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
type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type PcmSession = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silentGain: GainNode;
  stream: MediaStream;
  buffers: Float32Array[];
  sampleRate: number;
};

type Choice = {
  id: VoiceActionTarget;
  label: string;
  detail: string;
  icon: typeof Mic;
};

const choices: Choice[] = [
  { id: "command", label: "Plusieurs actions", detail: "Client + coordonnées + devis + planning… dans une seule demande", icon: Sparkles },
  { id: "quote", label: "Un devis", detail: "Client, prestations, quantités, prix et TVA", icon: FileText },
  { id: "invoice", label: "Une facture", detail: "Toujours créée en brouillon", icon: ReceiptText },
  { id: "customer", label: "Un client", detail: "Coordonnées, adresse, SIRET et TVA", icon: UserRound },
  { id: "agenda", label: "Agenda", detail: "Rendez-vous, intervention ou relance", icon: CalendarDays },
];

const intentLabels: Record<string, string> = {
  create_customer: "Créer le client",
  prepare_quote: "Créer un brouillon de devis",
  prepare_invoice: "Créer un brouillon de facture",
  schedule_task: "Ajouter à l’agenda",
  update_project_note: "Ajouter une note chantier",
  prepare_supplier_order: "Préparer une commande fournisseur",
  mark_payment: "Enregistrer un paiement",
  prepare_email: "Préparer un e-mail",
};

function speechConstructor() {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function audioContextConstructor() {
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function tearDown(session: PcmSession) {
  session.processor.onaudioprocess = null;
  try { session.source.disconnect(); } catch {}
  try { session.processor.disconnect(); } catch {}
  try { session.silentGain.disconnect(); } catch {}
  session.stream.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => undefined);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function euro(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "montant à préciser";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(parsed);
}

function proposalSummary(proposal: ActionProposalView) {
  const payload = proposal.payload ?? {};
  if (proposal.intent_type === "create_customer") {
    const name = clean(payload.company_name) || [payload.civility, payload.last_name, payload.first_name].map(clean).filter(Boolean).join(" ") || "Client à compléter";
    const emails = Array.isArray(payload.emails) ? payload.emails.map(clean).filter(Boolean) : [];
    const phones = Array.isArray(payload.phones) ? payload.phones.map(clean).filter(Boolean) : [];
    return [name, clean(payload.siret) ? `SIRET ${clean(payload.siret)}` : "", emails[0] || "", phones[0] || ""].filter(Boolean).join(" · ");
  }
  if (proposal.intent_type === "prepare_quote" || proposal.intent_type === "prepare_invoice") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const client = clean(payload.customer_hint) || (payload.customer_from_proposal_id ? "Nouveau client de cette demande" : "Client à préciser");
    const lineDetails = items.slice(0, 6).map((entry) => {
      const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const label = clean(row.label) || "Prestation";
      const quantity = row.quantity === null || row.quantity === undefined ? "qté ?" : `${row.quantity}${clean(row.unit) ? ` ${clean(row.unit)}` : ""}`;
      const price = row.unit_price === null || row.unit_price === undefined ? "prix ?" : `${euro(row.unit_price)} HT`;
      const tax = row.tax_rate === null || row.tax_rate === undefined ? "TVA ?" : `TVA ${row.tax_rate} %`;
      return `${label}: ${quantity} × ${price} (${tax})`;
    });
    const extra = items.length > 6 ? `+ ${items.length - 6} autre${items.length - 6 > 1 ? "s" : ""} ligne${items.length - 6 > 1 ? "s" : ""}` : "";
    return [client, ...lineDetails, extra].filter(Boolean).join(" · ") || `${client} · aucune prestation`;
  }
  if (proposal.intent_type === "schedule_task") {
    return [clean(payload.title), clean(payload.date), clean(payload.time), clean(payload.location)].filter(Boolean).join(" · ") || "Événement à compléter";
  }
  if (proposal.intent_type === "prepare_supplier_order") {
    const quantity = payload.quantity === null || payload.quantity === undefined ? "" : `Qté ${payload.quantity}`;
    const amount = payload.unit_price === null || payload.unit_price === undefined ? "" : `${euro(payload.unit_price)} HT/unité`;
    return [clean(payload.supplier_name), clean(payload.label), quantity, amount].filter(Boolean).join(" · ") || "Commande à compléter";
  }
  if (proposal.intent_type === "mark_payment") {
    return `${clean(payload.invoice_number) || "Facture à préciser"} · ${euro(payload.amount)}`;
  }
  if (proposal.intent_type === "prepare_email") {
    return `${clean(payload.to) || "Destinataire à préciser"} · ${clean(payload.subject) || "Objet à préciser"}`;
  }
  if (proposal.intent_type === "update_project_note") return clean(payload.body) || "Note à compléter";
  return "Action préparée";
}

function riskLabel(value: ActionProposalView["risk_level"]) {
  if (value === "explicit_confirmation") return "Confirmation forte";
  if (value === "review") return "À vérifier";
  return "Faible risque";
}

function placeholder(target: VoiceActionTarget | null) {
  if (target === "command") return "Ex. Crée le client Martin Peinture, tél. 06…, e-mail…, adresse…, puis un devis : préparation 80 m² à 8 € HT + peinture 80 m² à 22 € HT, TVA 10 %, et une visite mardi à 14 h à son adresse.";
  if (target === "customer") return "Ex. Société Martin Peinture, SIRET…, téléphone…, adresse…";
  if (target === "agenda") return "Ex. Mets une visite mardi prochain à 14 h chez Dupont.";
  return "Ex. Client Dupont, peinture 18 m² à 32 € HT, TVA 10 %.";
}

async function parseSingleTarget(target: Exclude<VoiceActionTarget, "command">, transcript: string) {
  const agenda = target === "agenda";
  const response = await fetch(agenda ? "/api/ai/agenda" : "/api/ai/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agenda
      ? { transcript }
      : { kind: target === "customer" ? "customer" : "document", transcript, target }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.data) {
    throw new Error(typeof result?.error === "string" ? result.error : "Analyse de la dictée impossible.");
  }
  return result.data;
}

export default function ActionVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<VoiceActionTarget | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [proposals, setProposals] = useState<ActionProposalView[]>([]);
  const [results, setResults] = useState<ActionExecutionResult[]>([]);
  const [explicitConfirmed, setExplicitConfirmed] = useState(false);
  const [groqReady, setGroqReady] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const transcriptRef = useRef("");
  const targetRef = useRef<VoiceActionTarget | null>(null);
  const pcmRef = useRef<PcmSession | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const analysisControllerRef = useRef<AbortController | null>(null);

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopCapture = useCallback(() => {
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const session = pcmRef.current;
    pcmRef.current = null;
    setVoiceLevel(0);
    if (session) tearDown(session);
  }, []);

  const reset = useCallback((preset?: VoiceActionTarget | null) => {
    stopCapture();
    targetRef.current = preset ?? null;
    setTarget(preset ?? null);
    setStage(preset ? "ready" : "choose");
    updateTranscript("");
    setMessage("");
    setProposals([]);
    setResults([]);
    setExplicitConfirmed(false);
  }, [stopCapture, updateTranscript]);

  const close = useCallback(() => {
    const shouldRefresh = stage === "success" && results.some((result) => result.entityId || result.entityType === "payment");
    stopCapture();
    setOpen(false);
    if (shouldRefresh) window.setTimeout(() => window.location.reload(), 80);
  }, [results, stage, stopCapture]);

  useEffect(() => {
    fetch("/api/ai/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { groq?: boolean }) => setGroqReady(Boolean(data.groq)))
      .catch(() => setGroqReady(false));
  }, []);

  useEffect(() => {
    const mobileClick = (event: Event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      const element = event.target as Element | null;
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      const activeTab = document.querySelector(".rm-bottom-nav button.active")?.textContent || "";
      const preset: VoiceActionTarget = activeTab.includes("Factures")
        ? "invoice"
        : activeTab.includes("Clients")
          ? "customer"
          : activeTab.includes("Agenda")
            ? "agenda"
            : "quote";
      reset(preset);
      setOpen(true);
    };
    const custom = (event: Event) => {
      const preset = (event as CustomEvent<{ target?: VoiceActionTarget }>).detail?.target ?? null;
      reset(preset);
      setOpen(true);
    };
    document.addEventListener("click", mobileClick, true);
    window.addEventListener("projetchapet:open-ai", custom);
    return () => {
      document.removeEventListener("click", mobileClick, true);
      window.removeEventListener("projetchapet:open-ai", custom);
    };
  }, [reset]);

  useEffect(() => () => stopCapture(), [stopCapture]);

  function choose(next: VoiceActionTarget) {
    targetRef.current = next;
    setTarget(next);
    setStage("ready");
    setMessage("");
  }

  async function prepare(text: string) {
    const selected = targetRef.current;
    if (!selected || !text.trim()) {
      setMessage("Dictez ou écrivez d’abord votre demande.");
      setStage("ready");
      return;
    }
    setStage("analysing");
    setMessage("");
    setProposals([]);
    setExplicitConfirmed(false);
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const organizationId = await getActiveOrganizationId();
      const parsed = selected === "command" ? undefined : await parseSingleTarget(selected, text);
      const planned = await planVoiceActions({
        organizationId,
        transcript: text,
        target: selected,
        parsed,
      });
      if (!planned.proposals.length) throw new Error("Aucune action exploitable n’a été reconnue.");
      setProposals(planned.proposals);
      setStage("review");
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "La préparation a pris trop de temps. Réessayez."
        : error instanceof Error
          ? error.message
          : "Préparation impossible.");
      setStage("error");
    } finally {
      window.clearTimeout(timeout);
      if (analysisControllerRef.current === controller) analysisControllerRef.current = null;
    }
  }

  function browserDictation() {
    const Constructor = speechConstructor();
    setVoiceLevel(0);
    if (!Constructor) {
      setMessage("Micro non disponible. Autorisez le microphone ou écrivez la demande.");
      setStage("ready");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) updateTranscript(`${transcriptRef.current} ${text}`.trim());
    };
    recognition.onerror = (event) => {
      setVoiceLevel(0);
      setMessage(event.error ? `Micro interrompu : ${event.error}` : "Micro interrompu.");
      setStage("ready");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceLevel(0);
      const text = transcriptRef.current.trim();
      if (text) void prepare(text);
      else setStage("ready");
    };
    recognitionRef.current = recognition;
    setStage("recording");
    recognition.start();
  }

  async function startRecording() {
    setMessage("");
    setVoiceLevel(0);
    updateTranscript("");
    setProposals([]);
    if (!groqReady || !navigator.mediaDevices?.getUserMedia) {
      browserDictation();
      return;
    }
    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass) {
      browserDictation();
      return;
    }
    setStage("requesting");
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        buffers.push(chunk);
        const peak = audioPeak(chunk);
        const normalized = Math.min(1, Math.max(0, (peak - 0.006) / 0.12));
        setVoiceLevel((current) => Math.max(normalized, current * 0.58));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      pcmRef.current = { context, source, processor, silentGain, stream, buffers, sampleRate: context.sampleRate };
      setStage("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => undefined);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Microphone refusé. Autorisez-le dans les réglages du navigateur.");
        setStage("ready");
      } else {
        browserDictation();
      }
    }
  }

  async function stopRecording() {
    const session = pcmRef.current;
    if (!session) {
      recognitionRef.current?.stop();
      return;
    }
    pcmRef.current = null;
    setVoiceLevel(0);
    setStage("transcribing");
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    tearDown(session);
    const samples = mergeFloat32Buffers(session.buffers);
    const duration = samples.length / session.sampleRate;
    if (duration < 0.45 || audioPeak(samples) < 0.0015) {
      setMessage("Aucun son exploitable. Parlez au moins une seconde et réessayez.");
      setStage("ready");
      return;
    }
    try {
      const blob = encodeMonoWav(samples, session.sampleRate);
      const form = new FormData();
      form.append("file", new File([blob], "dictee.wav", { type: "audio/wav" }));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Transcription impossible.");
      const text = clean(result.text);
      if (!text) throw new Error("Aucun texte reconnu.");
      updateTranscript(text);
      await prepare(text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  async function execute() {
    if (!proposals.length) return;
    const blocking = proposals.some((proposal) => proposal.status !== "ready" || (proposal.missing_fields ?? []).length > 0);
    if (blocking) {
      setMessage("Corrigez la dictée : certaines informations nécessaires manquent encore.");
      return;
    }
    const sensitive = proposals.some((proposal) => proposal.risk_level === "explicit_confirmation");
    if (sensitive && !explicitConfirmed) {
      setMessage("Cochez la confirmation des actions sensibles avant de continuer.");
      return;
    }
    setStage("executing");
    setMessage("");
    try {
      const organizationId = await getActiveOrganizationId();
      const execution = await executeVoiceActions({
        organizationId,
        proposalIds: proposals.map((proposal) => proposal.id),
        explicitConfirmation: explicitConfirmed,
      });
      setResults(execution.results);
      for (const result of execution.results) {
        if (result.clientAction === "agenda" && result.clientPayload) {
          window.dispatchEvent(new CustomEvent("projetchapet:agenda-ai-apply", {
            detail: { target: "agenda", data: result.clientPayload },
          }));
        }
      }
      window.dispatchEvent(new CustomEvent("manufeo:workspace-changed", { detail: execution.results }));
      setStage("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Exécution impossible.");
      setStage("review");
    }
  }

  const busy = ["requesting", "transcribing", "analysing", "executing"].includes(stage);
  const sensitive = proposals.some((proposal) => proposal.risk_level === "explicit_confirmation");
  const blocking = proposals.some((proposal) => proposal.status !== "ready" || (proposal.missing_fields ?? []).length > 0);

  return (
    <>
      <button
        type="button"
        className="pc-ai-launcher ava-launcher"
        data-tour="ai-voice"
        aria-label="Ouvrir le mode IA"
        onClick={() => { reset(null); setOpen(true); }}
      >
        <Sparkles size={17} />
        <span>Mode IA</span>
      </button>

      {open && (
        <div className="ava-overlay" role="dialog" aria-modal="true" aria-label="Assistant vocal MANUFEO">
          <section className="ava-panel">
            <header className="ava-header">
              <div><small>MANUFEO IA</small><h2>Parlez, MANUFEO prépare.</h2></div>
              <button type="button" aria-label="Fermer" onClick={close}><X size={20} /></button>
            </header>

            {stage === "choose" && (
              <div className="ava-choices">
                <div className="ava-intro"><Mic size={28} /><strong>Que voulez-vous faire ?</strong><span>Vous pouvez enchaîner plusieurs actions dans une seule phrase.</span></div>
                {choices.map(({ id, label, detail, icon: Icon }) => (
                  <button type="button" key={id} onClick={() => choose(id)}>
                    <i><Icon size={21} /></i><span><strong>{label}</strong><small>{detail}</small></span>
                  </button>
                ))}
              </div>
            )}

            {(stage === "ready" || stage === "recording" || stage === "requesting" || stage === "transcribing" || stage === "analysing" || stage === "error") && (
              <div className="ava-capture">
                <span className="ava-target">{choices.find((choice) => choice.id === target)?.label ?? "Demande"}</span>
                <button
                  type="button"
                  className={`ava-mic ${stage === "recording" ? "recording" : ""}`}
                  disabled={busy && stage !== "recording"}
                  onClick={stage === "recording" ? () => void stopRecording() : () => void startRecording()}
                  aria-label={stage === "recording" ? "Arrêter la dictée" : "Commencer la dictée"}
                >
                  {stage === "recording" ? <Square size={28} /> : busy ? <Loader2 size={32} className="ava-spin" /> : <Mic size={34} />}
                </button>
                {stage === "recording" && <VoiceListeningVisualizer level={voiceLevel} reactive={Boolean(pcmRef.current)} />}
                <h3>{stage === "recording" ? "Je vous écoute…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "MANUFEO prépare les actions…" : "Dictez naturellement"}</h3>
                <p>Rien n’est exécuté avant votre validation.</p>
                {target === "command" && <CommandPrecisionGuide />}
                <textarea
                  value={transcript}
                  onChange={(event) => updateTranscript(event.target.value)}
                  placeholder={placeholder(target)}
                  aria-label="Demande à MANUFEO"
                  disabled={busy}
                />
                {message && <div className="ava-message" role="status">{message}</div>}
                {(stage === "ready" || stage === "error") && transcript.trim() && (
                  <button type="button" className="ava-primary" onClick={() => void prepare(transcriptRef.current)}>Préparer les actions</button>
                )}
                {(stage === "ready" || stage === "error") && (
                  <button type="button" className="ava-secondary" onClick={() => { targetRef.current = null; setTarget(null); setStage("choose"); setMessage(""); }}>Changer de type</button>
                )}
              </div>
            )}

            {(stage === "review" || stage === "executing") && (
              <div className="ava-review">
                <div className="ava-review-head"><Check size={20} /><div><strong>{proposals.length} action{proposals.length > 1 ? "s" : ""} préparée{proposals.length > 1 ? "s" : ""}</strong><small>Vérifiez tout avant de valider.</small></div></div>
                <div className="ava-action-list">
                  {proposals.map((proposal, index) => (
                    <article key={proposal.id} className={proposal.status === "needs_input" ? "blocked" : ""}>
                      <div className="ava-action-number">{index + 1}</div>
                      <div className="ava-action-main">
                        <div className="ava-action-title"><strong>{intentLabels[proposal.intent_type] ?? proposal.intent_type}</strong><span className={`risk-${proposal.risk_level}`}>{riskLabel(proposal.risk_level)}</span></div>
                        <p>{proposalSummary(proposal)}</p>
                        {(proposal.warnings ?? []).map((warning) => <small className="ava-warning" key={warning}>⚠ {warning}</small>)}
                        {(proposal.missing_fields ?? []).length > 0 && <small className="ava-missing">À préciser : {proposal.missing_fields.join(", ")}</small>}
                      </div>
                    </article>
                  ))}
                </div>
                {message && <div className="ava-message" role="status">{message}</div>}
                {sensitive && (
                  <label className="ava-explicit">
                    <input type="checkbox" checked={explicitConfirmed} onChange={(event) => setExplicitConfirmed(event.target.checked)} disabled={stage === "executing"} />
                    <span><strong>Je confirme les actions sensibles</strong><small>Paiement, facture, commande ou autre opération signalée. MANUFEO n’envoie jamais un document ou un e-mail sans étape dédiée.</small></span>
                  </label>
                )}
                {blocking && <div className="ava-blocking">Certaines informations manquent. Reformulez la dictée : MANUFEO n’inventera pas les valeurs.</div>}
                <button type="button" className="ava-primary" disabled={blocking || stage === "executing" || (sensitive && !explicitConfirmed)} onClick={() => void execute()}>
                  {stage === "executing" ? <><Loader2 size={17} className="ava-spin" /> Exécution sécurisée…</> : "Valider et exécuter"}
                </button>
                <button type="button" className="ava-secondary" disabled={stage === "executing"} onClick={() => { setProposals([]); setStage("ready"); setMessage(""); setExplicitConfirmed(false); }}>Corriger la demande</button>
              </div>
            )}

            {stage === "success" && (
              <div className="ava-success">
                <div className="ava-success-icon"><Check size={30} /></div>
                <h3>Terminé.</h3>
                <p>MANUFEO a exécuté uniquement ce que vous avez validé.</p>
                <div>{results.map((result) => <span key={result.proposalId}><Check size={15} /> {result.message}</span>)}</div>
                <button type="button" className="ava-primary" onClick={close}>Voir les changements</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
