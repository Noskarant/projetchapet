"use client";

import { Check, FileText, Loader2, Mic, ReceiptText, Square, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";

type Target = "quote" | "invoice" | "customer";
type Stage = "choose" | "ready" | "requesting" | "recording" | "transcribing" | "analysing" | "review" | "error";
type ParsedLine = { label?: string; description?: string; quantity?: number; unit?: string; unit_price?: number; tax_rate?: number };
type ParsedDocument = { customer_hint?: string; title?: string; notes?: string; items?: ParsedLine[] };
type ParsedCustomer = { kind?: "business" | "individual"; company_name?: string; civility?: string; last_name?: string; first_name?: string; siret?: string; vat_number?: string; email1?: string; email2?: string; phone1?: string; phone2?: string; line1?: string; postal_code?: string; city?: string };
type ParsedResult = ParsedDocument | ParsedCustomer;

type RecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;
type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type PcmSession = { context: AudioContext; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; silentGain: GainNode; stream: MediaStream; buffers: Float32Array[]; sampleRate: number; target: Target };

const choices = [
  { id: "quote" as Target, label: "Un devis", detail: "Client, prestations, prix et TVA", icon: FileText },
  { id: "invoice" as Target, label: "Une facture", detail: "Prestations, échéance et règlement", icon: ReceiptText },
  { id: "customer" as Target, label: "Un client", detail: "Coordonnées, adresse, SIRET et TVA", icon: UserRound },
];

function speechConstructor() {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
function audioContextConstructor() {
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}
function euro(value: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value); }
function tearDown(session: PcmSession) {
  session.processor.onaudioprocess = null;
  try { session.source.disconnect(); } catch {}
  try { session.processor.disconnect(); } catch {}
  try { session.silentGain.disconnect(); } catch {}
  session.stream.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => undefined);
}

export default function MobileAiAssistantV4() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("");
  const [groqReady, setGroqReady] = useState(false);
  const targetRef = useRef<Target | null>(null);
  const transcriptRef = useRef("");
  const pcmRef = useRef<PcmSession | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const updateTranscript = useCallback((value: string) => { transcriptRef.current = value; setTranscript(value); }, []);
  const stopAll = useCallback(() => {
    recognitionRef.current?.stop(); recognitionRef.current = null;
    const session = pcmRef.current; pcmRef.current = null; if (session) tearDown(session);
  }, []);
  const reset = useCallback((preset?: Target | null) => {
    stopAll(); targetRef.current = preset ?? null; setTarget(preset ?? null); setStage(preset ? "ready" : "choose");
    updateTranscript(""); setParsed(null); setMessage(""); setProvider("");
  }, [stopAll, updateTranscript]);

  useEffect(() => {
    fetch("/api/ai/status", { cache: "no-store" }).then((response) => response.json()).then((data: { groq?: boolean }) => setGroqReady(Boolean(data.groq))).catch(() => setGroqReady(false));
  }, []);
  useEffect(() => {
    const click = (event: Event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      const element = event.target as Element | null;
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault(); event.stopPropagation(); (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      const activeTab = document.querySelector(".rm-bottom-nav button.active")?.textContent || "";
      const preset: Target = activeTab.includes("Factures") ? "invoice" : activeTab.includes("Clients") ? "customer" : "quote";
      reset(preset); setOpen(true);
    };
    const custom = (event: Event) => {
      const preset = (event as CustomEvent<{ target?: Target }>).detail?.target ?? null;
      reset(preset); setOpen(true);
    };
    document.addEventListener("click", click, true);
    window.addEventListener("projetchapet:open-ai", custom);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("projetchapet:open-ai", custom); };
  }, [reset]);
  useEffect(() => () => stopAll(), [stopAll]);

  async function analyse(text: string, selected: Target) {
    if (!text.trim()) { setMessage("Aucun texte reconnu. Vous pouvez écrire la demande ci-dessous."); setStage("ready"); return; }
    setStage("analysing"); setMessage("");
    try {
      const response = await fetch("/api/ai/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: selected === "customer" ? "customer" : "document", transcript: text, target: selected }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Analyse impossible.");
      setParsed(result.data as ParsedResult); setProvider(String(result.provider ?? "")); setStage("review");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Analyse impossible."); setStage("error"); }
  }
  async function transcribe(blob: Blob, selected: Target, duration: number) {
    if (blob.size < 1000) { setMessage("L’enregistrement n’a pas produit de son. Parlez au moins une seconde."); setStage("ready"); return; }
    setStage("transcribing");
    try {
      const form = new FormData(); form.append("file", new File([blob], "dictee.wav", { type: "audio/wav" }));
      const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 55000);
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal }); window.clearTimeout(timeout);
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text ?? "").trim(); if (!text) throw new Error("Aucun texte reconnu. Parlez plus près du téléphone.");
      updateTranscript(text); setProvider(`${String(result.provider ?? "Groq Whisper")} · ${duration.toFixed(1)} s`); await analyse(text, selected);
    } catch (error) { setMessage(error instanceof DOMException && error.name === "AbortError" ? "La transcription a pris trop de temps." : error instanceof Error ? error.message : "Transcription impossible."); setStage("error"); }
  }
  function browserDictation(selected: Target) {
    const Constructor = speechConstructor();
    if (!Constructor) { setMessage("Micro non disponible. Autorisez le microphone dans Safari ou écrivez la demande."); setStage("ready"); return; }
    const recognition = new Constructor(); recognition.lang = "fr-FR"; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = (event) => { const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim(); if (text) updateTranscript(`${transcriptRef.current} ${text}`.trim()); };
    recognition.onerror = (event) => { setMessage(event.error ? `Micro interrompu : ${event.error}` : "Micro interrompu."); setStage("ready"); };
    recognition.onend = () => { recognitionRef.current = null; const text = transcriptRef.current.trim(); if (text) void analyse(text, selected); else setStage("ready"); };
    recognitionRef.current = recognition; setStage("recording"); recognition.start();
  }
  async function startRecording() {
    const selected = targetRef.current; if (!selected) return;
    setMessage(""); updateTranscript(""); setParsed(null);
    if (!groqReady || !navigator.mediaDevices?.getUserMedia) { browserDictation(selected); return; }
    const AudioContextClass = audioContextConstructor(); if (!AudioContextClass) { browserDictation(selected); return; }
    setStage("requesting"); let context: AudioContext | null = null; let stream: MediaStream | null = null;
    try {
      context = new AudioContextClass({ latencyHint: "interactive" }); await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const source = context.createMediaStreamSource(stream); const processor = context.createScriptProcessor(4096, 1, 1); const silentGain = context.createGain(); silentGain.gain.value = 0; const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => buffers.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor); processor.connect(silentGain); silentGain.connect(context.destination); await context.resume();
      pcmRef.current = { context, source, processor, silentGain, stream, buffers, sampleRate: context.sampleRate, target: selected }; setStage("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop()); if (context) void context.close().catch(() => undefined);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") { setMessage("Microphone refusé. Safari : aA → Réglages du site web → Microphone → Autoriser."); setStage("ready"); }
      else browserDictation(selected);
    }
  }
  async function stopRecording() {
    const session = pcmRef.current;
    if (!session) { recognitionRef.current?.stop(); return; }
    pcmRef.current = null; setStage("transcribing"); await new Promise((resolve) => window.setTimeout(resolve, 120)); tearDown(session);
    const samples = mergeFloat32Buffers(session.buffers); const duration = samples.length / session.sampleRate;
    if (duration < .45 || samples.length < session.sampleRate * .35) { setMessage("Enregistrement trop court. Parlez au moins une seconde."); setStage("ready"); return; }
    if (audioPeak(samples) < .0015) { setMessage("Aucun son détecté. Vérifiez l’autorisation du microphone."); setStage("ready"); return; }
    await transcribe(encodeMonoWav(samples, session.sampleRate), session.target, duration);
  }
  function choose(next: Target) { targetRef.current = next; setTarget(next); setStage("ready"); setMessage(""); }
  function apply() {
    const selected = targetRef.current; if (!selected || !parsed) return;
    window.dispatchEvent(new CustomEvent("projetchapet:ai-apply", { detail: { target: selected, data: parsed } }));
    stopAll(); setOpen(false);
  }

  if (!open) return null;
  const documentData = target !== "customer" && parsed ? parsed as ParsedDocument : null;
  const customerData = target === "customer" && parsed ? parsed as ParsedCustomer : null;
  const busy = stage === "requesting" || stage === "transcribing" || stage === "analysing";

  return <div className="mai-overlay" role="dialog" aria-modal="true"><section className="mai-panel">
    <header><button onClick={() => { stopAll(); setOpen(false); }}><X size={22} /></button><div><small>ASSISTANT VOCAL</small><h2>Créer avec l’IA</h2></div><span /></header>
    {stage === "choose" && <div className="mai-choices"><div className="mai-intro"><Mic size={28} /><strong>Que voulez-vous créer ?</strong><span>Choisissez puis dictez naturellement.</span></div>{choices.map(({ id, label, detail, icon: Icon }) => <button key={id} onClick={() => choose(id)}><span><Icon size={23} /></span><div><strong>{label}</strong><small>{detail}</small></div></button>)}</div>}
    {stage !== "choose" && stage !== "review" && <div className="mai-capture"><span className="mai-target-label">{target === "quote" ? "NOUVEAU DEVIS" : target === "invoice" ? "NOUVELLE FACTURE" : "NOUVEAU CLIENT"}</span><button className={`mai-mic ${stage === "recording" ? "recording" : ""}`} onClick={stage === "recording" ? () => void stopRecording() : () => void startRecording()} disabled={busy}>{busy ? <Loader2 size={34} className="mai-spin" /> : stage === "recording" ? <Square size={30} /> : <Mic size={38} />}</button><h3>{stage === "recording" ? "Je vous écoute…" : stage === "requesting" ? "Activation du micro…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "Préparation…" : "Appuyez et dictez"}</h3><p>{stage === "recording" ? "Parlez au moins une seconde puis appuyez de nouveau." : "Parlez naturellement, comme sur le chantier."}</p><textarea value={transcript} onChange={(event) => updateTranscript(event.target.value)} placeholder={target === "customer" ? "Ex. Société Martin, SIRET…, téléphone…, adresse…" : "Ex. Client Dupont, peinture 18 m² à 32 euros, TVA 10 %."} />{message && <div className="mai-message">{message}</div>}{(stage === "ready" || stage === "error") && transcript.trim() && <button className="mai-primary" onClick={() => void analyse(transcriptRef.current, targetRef.current!)}>Analyser et préparer</button>}{(stage === "ready" || stage === "error") && <button className="mai-secondary" onClick={() => { targetRef.current = null; setTarget(null); setStage("choose"); setMessage(""); }}>Changer de document</button>}</div>}
    {stage === "review" && parsed && <div className="mai-review"><div className="mai-success"><Check size={22} /><div><strong>Informations reconnues</strong><small>{provider || "Analyse terminée"} · à vérifier</small></div></div>{customerData && <div className="mai-review-card"><strong>{customerData.company_name || [customerData.civility, customerData.last_name, customerData.first_name].filter(Boolean).join(" ") || "Client à compléter"}</strong><span>{[customerData.phone1, customerData.email1].filter(Boolean).join(" · ")}</span><small>{[customerData.line1, customerData.postal_code, customerData.city].filter(Boolean).join(", ")}</small></div>}{documentData && <div className="mai-review-card mai-lines"><strong>{documentData.title || "Document préparé"}</strong><span>{documentData.customer_hint || "Client à sélectionner"}</span>{(documentData.items ?? []).map((item, index) => <div key={`${item.label}-${index}`}><span><b>{item.label || "Ligne à compléter"}</b><small>{item.quantity ?? 1} {item.unit || "u"} · TVA {item.tax_rate ?? 20} %</small></span><strong>{euro(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))}</strong></div>)}</div>}<button className="mai-primary" onClick={apply}>Ouvrir le formulaire prérempli</button><button className="mai-secondary" onClick={() => { setParsed(null); setStage("ready"); }}>Corriger la dictée</button></div>}
  </section></div>;
}
