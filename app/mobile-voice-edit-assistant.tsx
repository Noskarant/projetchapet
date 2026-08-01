"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";
import styles from "./mobile-voice-edit-assistant.module.css";
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

type TargetData = MobileQuote | MobileInvoice | MobileAgendaEntry | MobileCustomer;
type VoiceTarget = {
  entity: VoiceEntityKind;
  id: string;
  label: string;
  data: TargetData;
};

type Stage = "ready" | "recording" | "transcribing" | "analysing" | "review" | "error" | "applied";

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

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const close = useCallback(() => {
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
    setStage("analysing");
    setMessage("");
    try {
      const workspace = readWorkspace();
      const response = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          target: { entity: target.entity, id: target.id, data: target.data },
          workspace,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.data) throw new Error(result?.error || "Analyse impossible.");
      const next = result.data as MobileVoiceCommand;
      next.entity = target.entity;
      next.id = target.id;
      setCommand(next);
      setMessage(result.warning || "");
      setStage("review");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La commande vocale n’a pas pu être analysée.");
      setStage("error");
    }
  }

  async function transcribe(blob: Blob) {
    if (blob.size < 1000) {
      setMessage("L’enregistrement est trop court.");
      setStage("ready");
      return;
    }
    setStage("transcribing");
    try {
      const form = new FormData();
      form.append("file", new File([blob], "modification-vocale.wav", { type: "audio/wav" }));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text || "").trim();
      if (!text) throw new Error("Aucun texte reconnu.");
      updateTranscript(text);
      setStage("ready");
      window.setTimeout(() => void analyseWithText(text), 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  async function analyseWithText(text: string) {
    if (!target || !text.trim()) return;
    setStage("analysing");
    setMessage("");
    try {
      const workspace = readWorkspace();
      const response = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, target: { entity: target.entity, id: target.id, data: target.data }, workspace }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.data) throw new Error(result?.error || "Analyse impossible.");
      const next = result.data as MobileVoiceCommand;
      next.entity = target.entity;
      next.id = target.id;
      setCommand(next);
      setMessage(result.warning || "");
      setStage("review");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analyse impossible.");
      setStage("error");
    }
  }

  function browserDictation() {
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
      const text = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      if (text) updateTranscript(`${transcriptRef.current} ${text}`.trim());
    };
    recognition.onerror = () => {
      setMessage("Le micro a été interrompu. Vous pouvez reprendre ou écrire la commande.");
      setStage("ready");
    };
    recognition.onend = () => {
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
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => buffers.push(new Float32Array(event.inputBuffer.getChannelData(0)));
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
        setMessage("Microphone refusé. Autorisez-le dans les réglages Safari du site.");
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
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    tearDown(session);
    const samples = mergeFloat32Buffers(session.buffers);
    if (samples.length < session.sampleRate * 0.35 || audioPeak(samples) < 0.0015) {
      setMessage("Aucun son exploitable n’a été détecté.");
      setStage("ready");
      return;
    }
    await transcribe(encodeMonoWav(samples, session.sampleRate));
  }

  function apply() {
    if (!target || !command) return;
    const current = readWorkspace();
    const updated = applyMobileVoiceCommand(current, { ...command, entity: target.entity, id: target.id });
    window.localStorage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(updated));
    setStage("applied");
    setMessage("Modification enregistrée. Actualisation de l’écran…");
    window.setTimeout(() => window.location.reload(), 650);
  }

  if (!target) return null;
  const busy = stage === "transcribing" || stage === "analysing";
  const changes = command ? changeSummary(command) : [];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Modifier à la voix">
      <section className={`${styles.panel} ${busy ? styles.busy : ""}`}>
        <header className={styles.header}>
          <button className={styles.close} onClick={close} aria-label="Fermer">×</button>
          <div><small>COMMANDE VOCALE</small><h2>Modifier à la voix</h2></div>
          <span />
        </header>

        <div className={styles.context}>
          <small>Élément sélectionné</small>
          <strong>{target.label}</strong>
        </div>

        {stage !== "review" && stage !== "applied" && (
          <>
            <div className={styles.micRow}>
              <button
                className={`${styles.mic} ${stage === "recording" ? styles.recording : ""}`}
                onClick={stage === "recording" ? () => void stopRecording() : () => void startRecording()}
                disabled={busy}
                aria-label={stage === "recording" ? "Arrêter la dictée" : "Commencer la dictée"}
              >
                {busy ? "…" : stage === "recording" ? "■" : "🎙"}
              </button>
              <strong>{stage === "recording" ? "Je vous écoute…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "Analyse des modifications…" : "Dictez la modification"}</strong>
            </div>
            <textarea
              className={styles.textarea}
              value={transcript}
              onChange={(event) => updateTranscript(event.target.value)}
              placeholder="Ex. Sur la ligne peinture murale, passe le prix à 35 euros et mets le devis en Validé."
            />
            <div className={styles.actions}>
              <button onClick={close}>Annuler</button>
              <button className={styles.primary} onClick={() => void analyse()} disabled={busy || !transcript.trim()}>Analyser</button>
            </div>
          </>
        )}

        {stage === "review" && command && (
          <div className={styles.review}>
            <small>Vérification avant application</small>
            <strong>{command.summary}</strong>
            <ul className={styles.changeList}>{changes.map((item) => <li key={item}>{item}</li>)}</ul>
            <div className={styles.actions}>
              <button onClick={() => { setCommand(null); setStage("ready"); }}>Corriger la demande</button>
              <button className={styles.primary} onClick={apply}>Appliquer</button>
            </div>
          </div>
        )}

        {stage === "applied" && <div className={styles.review}><small>Terminé</small><strong>La modification a été enregistrée.</strong></div>}
        {message && <p className={styles.message}>{message}</p>}
      </section>
    </div>
  );
}
