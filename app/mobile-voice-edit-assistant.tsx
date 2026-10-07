"use client";

import { authenticatedAiFetch } from "@/lib/authenticated-ai-fetch";
import { microphoneErrorMessage } from "@/lib/microphone-error";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";
import { X } from 'lucide-react';
import { VoicePreviewButton, VoiceStartingVisualizer, VoiceListeningVisualizer, VoiceProcessingVisualizer } from './action-voice-experience';
import './action-voice-assistant.css';
import {
  applyMobileVoiceCommand,
  type MobileVoiceCommand,
  type VoiceEntityKind,
} from "@/lib/mobile-voice-command";
import {
  customerDisplayName,
  seedMobileWorkspace,
  type MobileAgendaEntry,
  type MobileCustomer,
  type MobileInvoice,
  type MobileQuote,
  type MobileWorkspace,
} from "@/lib/mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import { readQuoteInternalMeta, writeQuoteInternalMeta } from '@/lib/mobile-quote-preview';
import { loadPrivateQuoteMeta, savePrivateQuoteMeta } from '@/lib/quote-private-cloud';
import { flushMobileWorkspace } from '@/lib/mobile-workspace-flush';
import { isDatabaseId } from '@/lib/mobile-desktop-sync';
import { spokenDeductibleAdjustment } from '@/lib/document-deductible';

type TargetData = MobileQuote | MobileInvoice | MobileAgendaEntry | MobileCustomer;
type VoiceTarget = {
  entity: VoiceEntityKind;
  id: string;
  label: string;
  data: TargetData;
};

type Stage = "ready" | "starting" | "recording" | "transcribing" | "analysing" | "review" | "error" | "applied";

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

function readWorkspace(): MobileWorkspace {
  try {
    const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MobileWorkspace>;
      if (Array.isArray(parsed.quotes) && Array.isArray(parsed.invoices) && Array.isArray(parsed.customers) && Array.isArray(parsed.agenda)) {
        return parsed as MobileWorkspace;
      }
    }
  } catch {
    // Le seed est volontairement conservé en secours.
  }
  return seedMobileWorkspace();
}

function audioContextConstructor() {
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function speechConstructor() {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function tearDown(session: PcmSession) {
  session.processor.onaudioprocess = null;
  try { session.source.disconnect(); } catch {}
  try { session.processor.disconnect(); } catch {}
  try { session.silentGain.disconnect(); } catch {}
  session.stream.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => undefined);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findLabelControl(root: ParentNode, labelText: string) {
  const labels = Array.from(root.querySelectorAll("label"));
  return labels.find((label) => normalize(label.textContent || "").startsWith(normalize(labelText)))
    ?.querySelector("input, textarea, select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
}

function identifyTarget(root: Element): VoiceTarget | null {
  const workspace = readWorkspace();
  const heading = root.querySelector("h2")?.textContent?.trim() || "";
  const kind = root.querySelector("header small")?.textContent?.trim().toUpperCase() || "";

  if (root.classList.contains("rm-detail-sheet")) {
    if (kind === "DEVIS") {
      const quote = workspace.quotes.find((item) => item.number === heading);
      return quote ? { entity: "quote", id: quote.id, label: `${quote.number} · ${quote.customerName}`, data: quote } : null;
    }
    if (kind === "FACTURE") {
      const invoice = workspace.invoices.find((item) => item.number === heading);
      return invoice ? { entity: "invoice", id: invoice.id, label: `${invoice.number} · ${invoice.customerName}`, data: invoice } : null;
    }
    if (kind === "CLIENT") {
      const needle = normalize(heading);
      const customer = workspace.customers.find((item) => normalize(customerDisplayName(item)) === needle);
      return customer ? { entity: "customer", id: customer.id, label: customerDisplayName(customer), data: customer } : null;
    }
  }

  if (root.classList.contains("rm-v2-editor") && /^modifier/i.test(heading)) {
    if (/devis/i.test(heading)) {
      const number = findLabelControl(root, "Numéro")?.value || "";
      const quote = workspace.quotes.find((item) => item.number === number);
      return quote ? { entity: "quote", id: quote.id, label: `${quote.number} · ${quote.customerName}`, data: quote } : null;
    }
    if (/facture/i.test(heading)) {
      const number = findLabelControl(root, "Numéro")?.value || "";
      const invoice = workspace.invoices.find((item) => item.number === number);
      return invoice ? { entity: "invoice", id: invoice.id, label: `${invoice.number} · ${invoice.customerName}`, data: invoice } : null;
    }
    if (/événement|evenement/i.test(heading)) {
      const date = findLabelControl(root, "Date")?.value || "";
      const time = findLabelControl(root, "Heure")?.value || "";
      const title = findLabelControl(root, "Consigne")?.value || "";
      const event = workspace.agenda.find((item) => item.date === date && item.time === time && item.title === title)
        || workspace.agenda.find((item) => item.date === date && item.title === title);
      return event ? { entity: "agenda", id: event.id, label: `${event.date} ${event.time} · ${event.title}`, data: event } : null;
    }
    if (/client/i.test(heading)) {
      const company = findLabelControl(root, "Raison sociale")?.value || "";
      const lastName = findLabelControl(root, "Nom")?.value || "";
      const firstName = findLabelControl(root, "Prénom")?.value || "";
      const needle = normalize(company || `${lastName} ${firstName}`);
      const customer = workspace.customers.find((item) => normalize(customerDisplayName(item)).includes(needle) || needle.includes(normalize(customerDisplayName(item))));
      return customer ? { entity: "customer", id: customer.id, label: customerDisplayName(customer), data: customer } : null;
    }
  }

  return null;
}

function styleInjectedButton(button: HTMLButtonElement) {
  button.type = "button";
  button.dataset.voiceEdit = "true";
  button.setAttribute("aria-label", "Modifier à la voix");
  button.textContent = "🎙 Modifier à la voix";
  Object.assign(button.style, {
    minHeight: "54px",
    borderRadius: "16px",
    border: "1px solid rgba(79, 134, 230, .45)",
    background: "linear-gradient(135deg, rgba(24, 75, 160, .16), rgba(84, 55, 190, .14))",
    color: "inherit",
    fontWeight: "800",
    fontSize: "15px",
    padding: "12px 16px",
  });
}

function changeSummary(command: MobileVoiceCommand) {
  const labels: string[] = [];
  const changes = command.changes || {};
  const human: Record<string, string> = {
    customer_name: "Client",
    title: "Objet / consigne",
    notes: "Notes",
    status: "Statut",
    issue_date: "Date d’émission",
    expiry_date: "Expiration",
    due_date: "Échéance",
    paid_total: "Montant payé",
    discount_percent: "Remise globale (%)",
    date: "Date",
    time: "Heure",
    type: "Type",
    done: "État",
    company_name: "Raison sociale",
    civility: "Civilité",
    last_name: "Nom",
    first_name: "Prénom",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse",
    postal_code: "Code postal",
    city: "Ville",
    siret: "SIRET",
    vat: "TVA",
  };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || key === "customer_id") continue;
    labels.push(`${human[key] || key} : ${typeof value === "boolean" ? value ? "Oui" : "Non" : String(value)}`);
  }
  for (const operation of command.line_operations || []) {
    const verb = operation.action === "add" ? "Ajouter" : operation.action === "delete" ? "Supprimer" : "Modifier";
    labels.push(`${verb} : ${operation.designation || operation.match || "ligne"}`);
  }
  if (command.line_order?.length) labels.push('Regrouper les prestations dans l’ordre demandé, en conservant leurs montants.');
  const deductible = spokenDeductibleAdjustment(command.deductible_request || '');
  if (deductible) labels.push(`Déduire la franchise : ${deductible.amount.toFixed(2).replace('.', ',')} €${deductible.priceType ? ` ${deductible.priceType.toUpperCase()}` : ' (HT ou TTC à préciser)'}.`);
  return labels.length ? labels : ["Aucune modification certaine détectée."];
}

export default function MobileVoiceEditAssistant() {
  const [target, setTarget] = useState<VoiceTarget | null>(null);
  const [stage, setStage] = useState<Stage>("ready");
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState<MobileVoiceCommand | null>(null);
  const pcmRef = useRef<PcmSession | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const recordingEpoch = useRef(0);
  const applying = useRef(false);
  const [micLevel, setMicLevel] = useState(0);

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const close = useCallback(() => {
    if (applying.current) return;
    recordingEpoch.current++;
    if (recognitionRef.current) recognitionRef.current.onend = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const session = pcmRef.current;
    pcmRef.current = null;
    if (session) tearDown(session);
    setTarget(null);
    setCommand(null);
    setTranscript("");
    transcriptRef.current = "";
    setMessage("");
    setStage("ready");
  }, []);

  useEffect(() => {
    const enhance = () => {
      const details = Array.from(document.querySelectorAll(".rm-detail-sheet"));
      for (const sheet of details) {
        const actions = sheet.querySelector(".rm-detail-actions");
        if (!actions || actions.querySelector("[data-voice-edit]")) continue;
        const identified = identifyTarget(sheet);
        if (!identified) continue;
        const button = document.createElement("button");
        styleInjectedButton(button);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setTarget(identifyTarget(sheet));
          setStage("ready");
          setCommand(null);
          setMessage("");
          updateTranscript("");
        });
        actions.append(button);
      }

      const editors = Array.from(document.querySelectorAll(".rm-v2-editor"));
      for (const editor of editors) {
        const heading = editor.querySelector("h2")?.textContent || "";
        if (!/^Modifier/i.test(heading)) continue;
        const footerActions = editor.querySelector("footer > div:last-child");
        if (!footerActions || footerActions.querySelector("[data-voice-edit]")) continue;
        const identified = identifyTarget(editor);
        if (!identified) continue;
        const button = document.createElement("button");
        styleInjectedButton(button);
        button.style.minHeight = "46px";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setTarget(identifyTarget(editor));
          setStage("ready");
          setCommand(null);
          setMessage("");
          updateTranscript("");
        });
        footerActions.prepend(button);
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [updateTranscript]);

  async function analyse() {
    if (!target || !transcript.trim()) {
      setMessage("Dictez ou écrivez la modification à appliquer.");
      return;
    }
    const epoch = recordingEpoch.current;
    setStage("analysing");
    setMessage("");
    try {
      const workspace = readWorkspace();
      const response = await authenticatedAiFetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          target: { entity: target.entity, id: target.id, data: target.data },
          workspace,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (epoch !== recordingEpoch.current) return;
      if (!response.ok || !result?.data) throw new Error(result?.error || "Analyse impossible.");
      const next = result.data as MobileVoiceCommand;
      next.entity = target.entity;
      next.id = target.id;
      setCommand(next);
      setMessage(result.warning || "");
      setStage("review");
    } catch (error) {
      if (epoch !== recordingEpoch.current) return;
      setMessage(error instanceof Error ? error.message : "La commande vocale n’a pas pu être analysée.");
      setStage("error");
    }
  }

  async function transcribe(blob: Blob) {
    const epoch = recordingEpoch.current;
    if (blob.size < 1000) {
      setMessage("L’enregistrement est trop court.");
      setStage("ready");
      return;
    }
    setStage("transcribing");
    try {
      const form = new FormData();
      form.append("file", new File([blob], "modification-vocale.wav", { type: "audio/wav" }));
      const response = await authenticatedAiFetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (epoch !== recordingEpoch.current) return;
      if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text || "").trim();
      if (!text) throw new Error("Aucun texte reconnu.");
      updateTranscript(text);
      setStage("ready");
      window.setTimeout(() => { if (epoch === recordingEpoch.current) void analyseWithText(text); }, 0);
    } catch (error) {
      if (epoch !== recordingEpoch.current) return;
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  async function analyseWithText(text: string) {
    if (!target || !text.trim()) return;
    const epoch = recordingEpoch.current;
    setStage("analysing");
    setMessage("");
    try {
      const workspace = readWorkspace();
      const response = await authenticatedAiFetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, target: { entity: target.entity, id: target.id, data: target.data }, workspace }),
      });
      const result = await response.json().catch(() => ({}));
      if (epoch !== recordingEpoch.current) return;
      if (!response.ok || !result?.data) throw new Error(result?.error || "Analyse impossible.");
      const next = result.data as MobileVoiceCommand;
      next.entity = target.entity;
      next.id = target.id;
      setCommand(next);
      setMessage(result.warning || "");
      setStage("review");
    } catch (error) {
      if (epoch !== recordingEpoch.current) return;
      setMessage(error instanceof Error ? error.message : "Analyse impossible.");
      setStage("error");
    }
  }

  function browserDictation() {
    const epoch = recordingEpoch.current;
    const Constructor = speechConstructor();
    if (!Constructor) {
      setMessage("Micro indisponible. Écrivez la commande dans la zone de texte.");
      setStage("ready");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      if (epoch !== recordingEpoch.current) return;
      const text = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      if (text) updateTranscript(`${transcriptRef.current} ${text}`.trim());
    };
    recognition.onerror = (event) => {
      if (epoch !== recordingEpoch.current) return;
      setMessage(microphoneErrorMessage(event.error, navigator.userAgent) ?? "Le micro a été interrompu. Vous pouvez reprendre ou écrire la commande.");
      setStage("ready");
    };
    recognition.onend = () => {
      if (epoch !== recordingEpoch.current) return;
      recognitionRef.current = null;
      const text = transcriptRef.current.trim();
      if (text) void analyseWithText(text);
      else setStage("ready");
    };
    recognitionRef.current = recognition;
    setStage("recording");
    recognition.start();
  }

  async function startRecording() {
    const epoch = ++recordingEpoch.current;
    setMessage("");
    setCommand(null);
    updateTranscript("");
    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) {
      browserDictation();
      return;
    }
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    setStage('starting');
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (epoch !== recordingEpoch.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0));
        buffers.push(samples);
        setMicLevel(Math.min(1, audioPeak(samples) * 3));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      pcmRef.current = { context, source, processor, silentGain, stream, buffers, sampleRate: context.sampleRate };
      setStage("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => undefined);
      if (epoch !== recordingEpoch.current) return;
      const help = microphoneErrorMessage(error, navigator.userAgent);
      if (help) {
        setMessage(help);
        setStage("ready");
      } else {
        browserDictation();
      }
    }
  }

  async function stopRecording() {
    const epoch = recordingEpoch.current;
    const session = pcmRef.current;
    if (!session) {
      recognitionRef.current?.stop();
      return;
    }
    pcmRef.current = null;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    tearDown(session);
    if (epoch !== recordingEpoch.current) return;
    const samples = mergeFloat32Buffers(session.buffers);
    if (samples.length < session.sampleRate * 0.15 || audioPeak(samples) < 0.0005) {
      setMessage("Le micro n’a pas capté votre voix. Vérifiez son autorisation et réessayez.");
      setStage("ready");
      return;
    }
    await transcribe(encodeMonoWav(samples, session.sampleRate));
  }

  async function apply() {
    if (!target || !command || applying.current) return;
    applying.current = true;
    setStage('analysing');
    setMessage('Enregistrement de la modification…');
    try {
      const current = readWorkspace();
      const updated = applyMobileVoiceCommand(current, { ...command, entity: target.entity, id: target.id });
      const cloud = isDatabaseId(target.id);
      if (target.entity === 'quote' && command.changes?.discount_percent !== undefined) {
        const quote = current.quotes.find(item => item.id === target.id);
        if (!quote) throw new Error('Ce devis est introuvable.');
        if (cloud) await loadPrivateQuoteMeta(window.localStorage);
        const meta = { ...readQuoteInternalMeta(window.localStorage, quote.number), discountPercent: command.changes.discount_percent };
        if (cloud) await savePrivateQuoteMeta(quote.number, meta);
        writeQuoteInternalMeta(window.localStorage, quote.number, meta);
      }
      window.localStorage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(updated));
      if (cloud) await flushMobileWorkspace();
      setStage("applied");
      setMessage("Modification enregistrée. Actualisation de l’écran…");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      applying.current = false;
      setStage('review');
      setMessage(error instanceof Error ? error.message : 'La modification reste en attente de sauvegarde.');
    }
  }

  if (!target) return null;
  const busy = stage === "transcribing" || stage === "analysing";
  const changes = command ? changeSummary(command) : [];
  const immersive = busy || stage === 'recording' || stage === 'starting';

  return (
    <div className={`ava-overlay${immersive ? ' ava-overlay-immersive' : ''}`} role="dialog" aria-modal="true" aria-label="Modifier à la voix">
      {stage === 'starting' ? <VoiceStartingVisualizer onClose={close} />
        : stage === 'recording' ? <VoiceListeningVisualizer level={micLevel} activity={micLevel} reactive={Boolean(pcmRef.current)} onFinish={() => void stopRecording()} onClose={close} />
        : busy ? <VoiceProcessingVisualizer onClose={close} label={applying.current ? message : undefined} closeDisabled={applying.current} />
        : <section className="ava-panel">
        <header className="ava-header">
          <div><small>MANUFEO · MODIFICATION</small><h2>Modifier à la voix</h2></div>
          <button onClick={close} aria-label="Fermer"><X size={20} /></button>
        </header>
        <div className="ava-capture">
        <span className="ava-target">{target.label}</span>
        {stage !== "review" && stage !== "applied" && (
          <>
            <VoicePreviewButton onStart={() => void startRecording()} />
            <p>Dictez les changements ou écrivez votre demande.</p>
            <textarea
              aria-label="Modification à demander à MANUFEO"
              value={transcript}
              onChange={(event) => updateTranscript(event.target.value)}
              placeholder="Ex. Sur la ligne peinture murale, passe le prix à 35 euros et mets le devis en Validé."
            />
            <button className="ava-primary" onClick={() => void analyse()} disabled={!transcript.trim()}>Analyser</button>
            <button className="ava-secondary" onClick={close}>Annuler</button>
          </>
        )}

        {stage === "review" && command && (
          <div className="ava-voice-edit-review">
            <small>Vérification avant application</small>
            <strong>{command.summary}</strong>
            <ul>{changes.map((item, index) => <li key={index}>{item}</li>)}</ul>
            <button className="ava-primary" onClick={() => void apply()}>Appliquer</button>
            <button className="ava-secondary" onClick={() => { setCommand(null); setStage("ready"); }}>Corriger la demande</button>
          </div>
        )}

        {stage === "applied" && <div className="ava-confirmation"><strong>La modification a été enregistrée.</strong></div>}
        {message && <div className="ava-message" role="status">{message}</div>}
        </div>
      </section>}
    </div>
  );
}
