"use client";

import {
  CalendarDays,
  Check,
  FileText,
  Loader2,
  Mic,
  ReceiptText,
  Square,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchMobileCustomer } from "@/lib/mobile-customer-match";
import { parseAgendaVoiceRequest, type ParsedAgendaVoice } from "@/lib/mobile-agenda-voice";
import { parseMobileWorkspace } from "@/lib/mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";

type Target = "quote" | "invoice" | "customer" | "agenda";
type Stage = "choose" | "ready" | "requesting" | "recording" | "transcribing" | "analysing" | "review" | "error";
type ParsedLine = {
  label?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  tax_rate?: number;
};
type ParsedDocument = {
  customer_hint?: string;
  title?: string;
  notes?: string;
  items?: ParsedLine[];
};
type ParsedCustomer = {
  kind?: "business" | "individual";
  company_name?: string;
  civility?: string;
  last_name?: string;
  first_name?: string;
  siret?: string;
  vat_number?: string;
  email1?: string;
  email2?: string;
  phone1?: string;
  phone2?: string;
  line1?: string;
  postal_code?: string;
  city?: string;
};
type ParsedResult = ParsedDocument | ParsedCustomer | ParsedAgendaVoice;

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
  target: Target;
};

const choices = [
  { id: "quote" as Target, label: "Un devis", detail: "Client, prestations, prix et TVA", icon: FileText },
  { id: "invoice" as Target, label: "Une facture", detail: "Prestations, échéance et règlement", icon: ReceiptText },
  { id: "customer" as Target, label: "Un client", detail: "Coordonnées, adresse, SIRET et TVA", icon: UserRound },
  { id: "agenda" as Target, label: "Agenda", detail: "Rendez-vous, intervention, relance ou commande", icon: CalendarDays },
];

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

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function dateFr(value: string) {
  if (!value) return "Date à compléter";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`));
}

function parseNumber(value: string | undefined, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function localCustomer(text: string): ParsedCustomer {
  const emails = [...text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)].map((match) => match[0]);
  const phones = [...text.matchAll(/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/g)].map((match) => match[0]);
  const siret = text.match(/\b\d{3}[ .]?\d{3}[ .]?\d{3}[ .]?\d{5}\b/)?.[0]?.replace(/\D/g, "") ?? "";
  const postalCode = text.match(/\b\d{5}\b/)?.[0] ?? "";
  const business = /soci[eé]t[eé]|entreprise|sarl|sas|sasu|eurl|siret|raison sociale/i.test(text);
  const company = text.match(/(?:soci[eé]t[eé]|entreprise|raison sociale)\s+([^,.;]+?)(?=\s+(?:siret|t[eé]l[eé]phone|adresse|email|e-mail)\b|[,.;]|$)/i)?.[1]?.trim() ?? "";
  const lastName = text.match(/(?:nom)\s+([^,.;]+?)(?=\s+(?:pr[eé]nom|t[eé]l[eé]phone|adresse)\b|[,.;]|$)/i)?.[1]?.trim() ?? "";
  const firstName = text.match(/(?:pr[eé]nom)\s+([^,.;]+?)(?=\s+(?:nom|t[eé]l[eé]phone|adresse)\b|[,.;]|$)/i)?.[1]?.trim() ?? "";
  return {
    kind: business ? "business" : "individual",
    company_name: company,
    civility: /monsieur et madame|m\. et mme/i.test(text) ? "M. et Mme" : /madame|mme/i.test(text) ? "Mme" : "M.",
    last_name: lastName,
    first_name: firstName,
    siret,
    vat_number: text.match(/FR\s?\d{2}\s?\d{9}/i)?.[0] ?? "",
    email1: emails[0] ?? "",
    email2: emails[1] ?? "",
    phone1: phones[0] ?? "",
    phone2: phones[1] ?? "",
    line1: text.match(/(?:adresse)\s+([^,.;]+?)(?=\s+\d{5}\b|[,.;]|$)/i)?.[1]?.trim() ?? "",
    postal_code: postalCode,
    city: postalCode ? text.match(new RegExp(`${postalCode}\\s+([^,.;]+)`, "i"))?.[1]?.trim() ?? "" : "",
  };
}

function localDocument(text: string): ParsedDocument {
  const tax = parseNumber(text.match(/TVA\s*(?:à|de)?\s*(5[,.]5|10|20|0)\s*%/i)?.[1], 20);
  const chunks = text
    .split(/(?:\.\s+|;\s*|\bensuite\b|\bpuis\b)/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 4);
  const items = chunks.map((chunk): ParsedLine | null => {
    const quantityMatch = chunk.match(/(\d+(?:[,.]\d+)?)\s*(m2|m²|mètres?\s+carrés?|ml|mètres?\s+linéaires?|heures?|h|unités?|u|forfaits?)/i);
    const priceMatch = chunk.match(/(?:à|pour|prix|de)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(HT|TTC)?/i);
    if (!quantityMatch && !priceMatch) return null;
    const unitText = quantityMatch?.[2]?.toLowerCase() ?? "u";
    const unit = /m2|m²|carr/.test(unitText)
      ? "m²"
      : /ml|lin/.test(unitText)
        ? "ml"
        : /heure|\bh\b/.test(unitText)
          ? "h"
          : /forfait/.test(unitText)
            ? "forfait"
            : "u";
    const quantity = parseNumber(quantityMatch?.[1], 1);
    const spokenPrice = parseNumber(priceMatch?.[1], 0);
    const isTtc = priceMatch?.[2]?.toLowerCase() === "ttc";
    const unitPrice = isTtc && tax > 0 ? Math.round((spokenPrice / (1 + tax / 100)) * 100) / 100 : spokenPrice;
    const label = chunk
      .replace(quantityMatch?.[0] ?? "", "")
      .replace(priceMatch?.[0] ?? "", "")
      .replace(/^(client|chantier|travaux|ajoute|ligne|prestation)\s+/i, "")
      .trim()
      .replace(/^[-,:]\s*/, "")
      .slice(0, 220);
    return {
      label: label || "Prestation dictée",
      description: "",
      quantity,
      unit,
      unit_price: unitPrice,
      tax_rate: tax,
    };
  }).filter((item): item is ParsedLine => Boolean(item));

  if (!items.length) {
    items.push({
      label: text.slice(0, 220) || "Prestation à compléter",
      description: "",
      quantity: 1,
      unit: "u",
      unit_price: 0,
      tax_rate: tax,
    });
  }

  return {
    customer_hint: text.match(/client\s+([^,.;]+?)(?=\s+(?:chantier|travaux|ajoute|préparation|peinture|plâtrerie)\b|[,.;]|$)/i)?.[1]?.trim() ?? "",
    title: text.match(/(?:objet|chantier|travaux)\s+([^,.;]+)/i)?.[1]?.trim() ?? "Travaux à préciser",
    notes: text,
    items,
  };
}

function localParse(text: string, target: Target): ParsedResult {
  if (target === "customer") return localCustomer(text);
  if (target === "agenda") return parseAgendaVoiceRequest(text);
  return localDocument(text);
}

function tearDown(session: PcmSession) {
  session.processor.onaudioprocess = null;
  try { session.source.disconnect(); } catch {}
  try { session.processor.disconnect(); } catch {}
  try { session.silentGain.disconnect(); } catch {}
  session.stream.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => undefined);
}

function targetLabel(target: Target | null) {
  if (target === "quote") return "NOUVEAU DEVIS";
  if (target === "invoice") return "NOUVELLE FACTURE";
  if (target === "customer") return "NOUVEAU CLIENT";
  return "NOUVEL ÉVÉNEMENT";
}

function targetPlaceholder(target: Target | null) {
  if (target === "customer") return "Ex. Société Martin, SIRET…, téléphone…, adresse…";
  if (target === "agenda") return "Ex. Mets-moi un rendez-vous mardi prochain à 14 h 30 avec SCI Bellevue au 4 place du Monteil.";
  return "Ex. Client Dupont, peinture 18 m² à 32 euros, TVA 10 %.";
}

export default function MobileAiAssistantV6() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [message, setMessage] = useState("");
  const [groqReady, setGroqReady] = useState(false);
  const targetRef = useRef<Target | null>(null);
  const transcriptRef = useRef("");
  const pcmRef = useRef<PcmSession | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const analysisRunRef = useRef(0);

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopAll = useCallback(() => {
    analysisRunRef.current += 1;
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const session = pcmRef.current;
    pcmRef.current = null;
    if (session) tearDown(session);
  }, []);

  const reset = useCallback((preset?: Target | null) => {
    stopAll();
    targetRef.current = preset ?? null;
    setTarget(preset ?? null);
    setStage(preset ? "ready" : "choose");
    updateTranscript("");
    setParsed(null);
    setMessage("");
  }, [stopAll, updateTranscript]);

  useEffect(() => {
    fetch("/api/ai/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { groq?: boolean }) => setGroqReady(Boolean(data.groq)))
      .catch(() => setGroqReady(false));
  }, []);

  useEffect(() => {
    const click = (event: Event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      const element = event.target as Element | null;
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      const activeTab = document.querySelector(".rm-bottom-nav button.active")?.textContent || "";
      const preset: Target = activeTab.includes("Factures")
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
      const preset = (event as CustomEvent<{ target?: Target }>).detail?.target ?? null;
      reset(preset);
      setOpen(true);
    };
    document.addEventListener("click", click, true);
    window.addEventListener("projetchapet:open-ai", custom);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("projetchapet:open-ai", custom);
    };
  }, [reset]);

  useEffect(() => () => stopAll(), [stopAll]);

  async function analyse(text: string, selected: Target) {
    if (!text.trim()) {
      setMessage("Aucun texte reconnu. Vous pouvez écrire la demande ci-dessous.");
      setStage("ready");
      return;
    }

    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const runId = ++analysisRunRef.current;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setStage("analysing");
    setMessage("");

    try {
      const isAgenda = selected === "agenda";
      const response = await fetch(isAgenda ? "/api/ai/agenda" : "/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAgenda
          ? { transcript: text }
          : { kind: selected === "customer" ? "customer" : "document", transcript: text, target: selected }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result?.data) throw new Error(result?.error || "Analyse impossible.");
      if (runId !== analysisRunRef.current) return;
      setParsed(result.data as ParsedResult);
      setStage("review");
    } catch (error) {
      if (runId !== analysisRunRef.current) return;
      setParsed(localParse(text, selected));
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "Analyse locale utilisée pour éviter un blocage réseau."
        : "Analyse locale utilisée. Vérifiez les informations.");
      setStage("review");
    } finally {
      window.clearTimeout(timeout);
      if (analysisControllerRef.current === controller) analysisControllerRef.current = null;
    }
  }

  async function transcribe(blob: Blob, selected: Target) {
    if (blob.size < 1000) {
      setMessage("L’enregistrement n’a pas produit de son. Parlez au moins une seconde.");
      setStage("ready");
      return;
    }
    setStage("transcribing");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const form = new FormData();
      form.append("file", new File([blob], "dictee.wav", { type: "audio/wav" }));
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text ?? "").trim();
      if (!text) throw new Error("Aucun texte reconnu. Parlez plus près du téléphone.");
      updateTranscript(text);
      await analyse(text, selected);
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "La transcription a pris trop de temps."
        : error instanceof Error
          ? error.message
          : "Transcription impossible.");
      setStage("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function browserDictation(selected: Target) {
    const Constructor = speechConstructor();
    if (!Constructor) {
      setMessage("Micro non disponible. Autorisez le microphone dans Safari ou écrivez la demande.");
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
      setMessage(event.error ? `Micro interrompu : ${event.error}` : "Micro interrompu.");
      setStage("ready");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      const text = transcriptRef.current.trim();
      if (text) void analyse(text, selected);
      else setStage("ready");
    };
    recognitionRef.current = recognition;
    setStage("recording");
    recognition.start();
  }

  async function startRecording() {
    const selected = targetRef.current;
    if (!selected) return;
    setMessage("");
    updateTranscript("");
    setParsed(null);
    if (!groqReady || !navigator.mediaDevices?.getUserMedia) {
      browserDictation(selected);
      return;
    }
    const AudioContextClass = audioContextConstructor();
    if (!AudioContextClass) {
      browserDictation(selected);
      return;
    }
    setStage("requesting");
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => buffers.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      await context.resume();
      pcmRef.current = {
        context,
        source,
        processor,
        silentGain,
        stream,
        buffers,
        sampleRate: context.sampleRate,
        target: selected,
      };
      setStage("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => undefined);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Microphone refusé. Safari : aA → Réglages du site web → Microphone → Autoriser.");
        setStage("ready");
      } else {
        browserDictation(selected);
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
    setStage("transcribing");
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    tearDown(session);
    const samples = mergeFloat32Buffers(session.buffers);
    const duration = samples.length / session.sampleRate;
    if (duration < 0.45 || samples.length < session.sampleRate * 0.35) {
      setMessage("Enregistrement trop court. Parlez au moins une seconde.");
      setStage("ready");
      return;
    }
    if (audioPeak(samples) < 0.0015) {
      setMessage("Aucun son détecté. Vérifiez l’autorisation du microphone.");
      setStage("ready");
      return;
    }
    await transcribe(encodeMonoWav(samples, session.sampleRate), session.target);
  }

  function choose(next: Target) {
    targetRef.current = next;
    setTarget(next);
    setStage("ready");
    setMessage("");
  }

  function apply() {
    const selected = targetRef.current;
    if (!selected || !parsed) return;
    if (selected !== "customer") {
      const hint = (parsed as ParsedDocument | ParsedAgendaVoice).customer_hint?.trim() || "";
      let match = null;
      try {
        const workspace = parseMobileWorkspace(window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY));
        match = matchMobileCustomer(workspace?.customers ?? [], hint);
      } catch {
        match = { status: "not_found" as const, matches: [] as [] };
      }
      if (match.status === "missing") {
        setMessage("Aucun client n’a été reconnu. Indiquez le nom du client dans la dictée.");
        return;
      }
      if (match.status === "ambiguous") {
        setMessage("Plusieurs clients correspondent. Dictez un nom plus précis.");
        return;
      }
      if (match.status === "not_found") {
        setMessage(`Le client « ${hint} » n’existe pas dans la liste. Créez-le d’abord ou corrigez son nom.`);
        return;
      }
    }

    const eventName = selected === "agenda" ? "projetchapet:agenda-ai-apply" : "projetchapet:ai-apply";
    window.dispatchEvent(new CustomEvent(eventName, { detail: { target: selected, data: parsed } }));
    stopAll();
    setOpen(false);
  }

  if (!open) return null;
  const documentData = (target === "quote" || target === "invoice") && parsed ? parsed as ParsedDocument : null;
  const customerData = target === "customer" && parsed ? parsed as ParsedCustomer : null;
  const agendaData = target === "agenda" && parsed ? parsed as ParsedAgendaVoice : null;
  const busy = stage === "requesting" || stage === "transcribing" || stage === "analysing";

  return (
    <div className="mai-overlay" role="dialog" aria-modal="true" aria-label="Créer avec l’IA">
      <section className="mai-panel">
        <header>
          <button onClick={() => { stopAll(); setOpen(false); }} aria-label="Fermer l’assistant"><X size={22} /></button>
          <div><small>ASSISTANT VOCAL</small><h2>Créer avec l’IA</h2></div>
          <span />
        </header>

        {stage === "choose" && (
          <div className="mai-choices">
            <div className="mai-intro"><Mic size={28} /><strong>Que voulez-vous créer ?</strong><span>Choisissez puis dictez naturellement.</span></div>
            {choices.map(({ id, label, detail, icon: Icon }) => (
              <button key={id} onClick={() => choose(id)}>
                <span><Icon size={23} /></span>
                <div><strong>{label}</strong><small>{detail}</small></div>
              </button>
            ))}
          </div>
        )}

        {stage !== "choose" && stage !== "review" && (
          <div className="mai-capture">
            <span className="mai-target-label">{targetLabel(target)}</span>
            <button
              className={`mai-mic ${stage === "recording" ? "recording" : ""}`}
              onClick={stage === "recording" ? () => void stopRecording() : () => void startRecording()}
              disabled={busy}
              aria-label={stage === "recording" ? "Arrêter la dictée" : "Commencer la dictée"}
            >
              {busy ? <Loader2 size={34} className="mai-spin" /> : stage === "recording" ? <Square size={30} /> : <Mic size={38} />}
            </button>
            <h3>{stage === "recording" ? "Je vous écoute…" : stage === "requesting" ? "Activation du micro…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "Préparation…" : "Appuyez et dictez"}</h3>
            <p>{stage === "recording" ? "Parlez au moins une seconde puis appuyez de nouveau." : "Parlez naturellement, comme sur le chantier."}</p>
            <textarea value={transcript} onChange={(event) => updateTranscript(event.target.value)} placeholder={targetPlaceholder(target)} aria-label="Demande à analyser" />
            {message && <div className="mai-message">{message}</div>}
            {(stage === "ready" || stage === "error") && transcript.trim() && (
              <button className="mai-primary" onClick={() => void analyse(transcriptRef.current, targetRef.current!)}>Analyser et préparer</button>
            )}
            {(stage === "ready" || stage === "error") && (
              <button className="mai-secondary" onClick={() => { targetRef.current = null; setTarget(null); setStage("choose"); setMessage(""); }}>Changer de document</button>
            )}
          </div>
        )}

        {stage === "review" && parsed && (
          <div className="mai-review">
            <div className="mai-success"><Check size={22} /><div><strong>Informations reconnues</strong><small>Analyse terminée · à vérifier</small></div></div>
            {message && <div className="mai-message">{message}</div>}
            {customerData && (
              <div className="mai-review-card">
                <strong>{customerData.company_name || [customerData.civility, customerData.last_name, customerData.first_name].filter(Boolean).join(" ") || "Client à compléter"}</strong>
                <span>{[customerData.phone1, customerData.email1].filter(Boolean).join(" · ")}</span>
                <small>{[customerData.line1, customerData.postal_code, customerData.city].filter(Boolean).join(", ")}</small>
              </div>
            )}
            {documentData && (
              <div className="mai-review-card mai-lines">
                <strong>{documentData.title || "Document préparé"}</strong>
                <span>{documentData.customer_hint || "Client à sélectionner"}</span>
                {(documentData.items ?? []).map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <span><b>{item.label || "Ligne à compléter"}</b><small>{item.quantity ?? 1} {item.unit || "u"} · TVA {item.tax_rate ?? 20} %</small></span>
                    <strong>{euro(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))}</strong>
                  </div>
                ))}
              </div>
            )}
            {agendaData && (
              <div className="mai-review-card">
                <strong>{agendaData.title || "Événement à compléter"}</strong>
                <span>{agendaData.type} · {dateFr(agendaData.date)} à {agendaData.time}</span>
                <small>{agendaData.customer_hint || "Client à compléter"}{agendaData.location ? ` · ${agendaData.location}` : ""}</small>
              </div>
            )}
            <button className="mai-primary" onClick={apply}>{target === "agenda" ? "Ajouter directement à l’agenda" : "Ouvrir le formulaire prérempli"}</button>
            <button className="mai-secondary" onClick={() => { setParsed(null); setStage("ready"); setMessage(""); }}>Corriger la dictée</button>
          </div>
        )}
      </section>
    </div>
  );
}
