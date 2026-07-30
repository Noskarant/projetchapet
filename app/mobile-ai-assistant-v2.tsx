"use client";

import { Check, FileText, Loader2, Mic, ReceiptText, Square, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Target = "quote" | "invoice" | "customer";
type Stage = "choose" | "ready" | "recording" | "transcribing" | "analysing" | "review" | "error";
type ParsedLine = { label?: string; quantity?: number; unit?: string; unit_price?: number; tax_rate?: number };
type ParsedDocument = { customer_hint?: string; title?: string; items?: ParsedLine[] };
type ParsedCustomer = { kind?: "business" | "individual"; company_name?: string; civility?: string; last_name?: string; first_name?: string; siret?: string; vat_number?: string; email1?: string; email2?: string; phone1?: string; phone2?: string; line1?: string; postal_code?: string; city?: string };
type ParsedResult = ParsedDocument | ParsedCustomer;

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

const choices = [
  { id: "quote" as Target, label: "Un devis", detail: "Client, prestations, prix et TVA", icon: FileText },
  { id: "invoice" as Target, label: "Une facture", detail: "Prestations, échéance et règlement", icon: ReceiptText },
  { id: "customer" as Target, label: "Un client", detail: "Coordonnées, adresse, SIRET et TVA", icon: UserRound },
];

function speechConstructor() {
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForSheet() {
  const started = Date.now();
  while (Date.now() - started < 2500) {
    const sheet = document.querySelector<HTMLElement>(".rm-create-sheet");
    if (sheet) return sheet;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Le formulaire mobile ne s’est pas ouvert.");
}

export default function MobileAiAssistantV2() {
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopAll = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopAll();
    targetRef.current = null;
    setTarget(null);
    setStage("choose");
    updateTranscript("");
    setParsed(null);
    setMessage("");
    setProvider("");
  }, [stopAll, updateTranscript]);

  useEffect(() => {
    fetch("/api/ai/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { groq?: boolean }) => setGroqReady(Boolean(data.groq)))
      .catch(() => setGroqReady(false));
  }, []);

  useEffect(() => {
    const intercept = (event: Event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      const element = event.target as Element | null;
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      reset();
      setOpen(true);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [reset]);

  useEffect(() => () => stopAll(), [stopAll]);

  async function analyse(text: string, selected: Target) {
    if (!text.trim()) {
      setMessage("Aucun texte reconnu. Vous pouvez écrire la demande ci-dessous.");
      setStage("ready");
      return;
    }
    setStage("analysing");
    setMessage("");
    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: selected === "customer" ? "customer" : "document", transcript: text, target: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analyse impossible.");
      setParsed(result.data as ParsedResult);
      setProvider(String(result.provider ?? ""));
      setStage("review");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analyse impossible.");
      setStage("error");
    }
  }

  async function transcribe(blob: Blob, selected: Target) {
    setStage("transcribing");
    try {
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", new File([blob], `dictee.${extension}`, { type: blob.type || "audio/webm" }));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text ?? "").trim();
      if (!text) throw new Error("Aucun texte n’a été reconnu.");
      updateTranscript(text);
      setProvider(String(result.provider ?? "Groq Whisper"));
      await analyse(text, selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  function browserDictation(selected: Target) {
    const Constructor = speechConstructor();
    if (!Constructor) {
      setMessage("Micro non disponible dans ce navigateur. Écrivez la demande ci-dessous.");
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

    if (!groqReady || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      browserDictation(selected);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const formats = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = formats.find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        void transcribe(blob, selected);
      };
      recorder.start(250);
      setStage("recording");
    } catch {
      browserDictation(selected);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else recognitionRef.current?.stop();
  }

  function choose(next: Target) {
    targetRef.current = next;
    setTarget(next);
    setStage("ready");
  }

  async function apply() {
    const selected = targetRef.current;
    if (!selected || !parsed) return;
    try {
      const tabLabel = selected === "quote" ? "Devis" : selected === "invoice" ? "Factures" : "Clients";
      Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button"))
        .find((button) => button.textContent?.includes(tabLabel))?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      document.querySelector<HTMLButtonElement>(".rm-create-main")?.click();
      const sheet = await waitForSheet();

      if (selected === "customer") {
        const customer = parsed as ParsedCustomer;
        if (customer.kind === "individual") Array.from(sheet.querySelectorAll<HTMLButtonElement>(".rm-kind-switch button")).find((button) => button.textContent?.includes("Particulier"))?.click();
        const values: Array<[string, string]> = [
          ["Nom de l’entreprise", customer.company_name ?? [customer.civility, customer.last_name, customer.first_name].filter(Boolean).join(" ")],
          ["14 chiffres", customer.siret ?? ""],
          ["FR…", customer.vat_number ?? ""],
          ["E-mail principal", customer.email1 ?? ""],
          ["Second e-mail", customer.email2 ?? ""],
          ["Téléphone principal", customer.phone1 ?? ""],
          ["Second téléphone", customer.phone2 ?? ""],
          ["Adresse complète", [customer.line1, customer.postal_code, customer.city].filter(Boolean).join(", ")],
        ];
        values.forEach(([placeholder, value]) => {
          if (!value) return;
          const input = Array.from(sheet.querySelectorAll<HTMLInputElement>("input")).find((item) => item.placeholder === placeholder);
          if (input) setValue(input, value);
        });
      } else {
        const documentData = parsed as ParsedDocument;
        const cardValues = sheet.querySelectorAll<HTMLElement>(".rm-form-card strong");
        if (documentData.customer_hint && cardValues[0]) cardValues[0].textContent = documentData.customer_hint;
        const items = documentData.items ?? [];
        const block = document.createElement("div");
        block.className = "mai-applied-lines";
        const heading = document.createElement("div");
        heading.className = "mai-applied-heading";
        const headingText = document.createElement("strong");
        headingText.textContent = documentData.title || "Prestations reconnues";
        const badge = document.createElement("span");
        badge.textContent = "IA · à vérifier";
        heading.append(headingText, badge);
        block.appendChild(heading);
        items.forEach((item) => {
          const row = document.createElement("div");
          const text = document.createElement("span");
          const title = document.createElement("strong");
          title.textContent = item.label || "Ligne à compléter";
          const meta = document.createElement("small");
          meta.textContent = `${item.quantity ?? 1} ${item.unit || "u"} · TVA ${item.tax_rate ?? 20} %`;
          text.append(title, meta);
          const price = document.createElement("b");
          price.textContent = euro(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0));
          row.append(text, price);
          block.appendChild(row);
        });
        sheet.querySelector(".mai-applied-lines")?.remove();
        sheet.querySelector(".rm-manual-line")?.before(block);
        const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unit_price ?? 0), 0);
        const tax = items.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unit_price ?? 0) * Number(item.tax_rate ?? 20) / 100, 0);
        const summary = sheet.querySelector<HTMLElement>("footer > div:first-child");
        const totalNode = summary?.querySelector("strong");
        const taxNode = summary?.querySelectorAll("small")[1];
        if (totalNode) totalNode.textContent = euro(total);
        if (taxNode) taxNode.textContent = `TVA : ${euro(tax)}`;
      }
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d’ouvrir le formulaire.");
      setStage("error");
    }
  }

  if (!open) return null;
  const documentData = target !== "customer" && parsed ? parsed as ParsedDocument : null;
  const customerData = target === "customer" && parsed ? parsed as ParsedCustomer : null;
  const busy = stage === "transcribing" || stage === "analysing";

  return <div className="mai-overlay" role="dialog" aria-modal="true">
    <section className="mai-panel">
      <header><button onClick={() => { stopAll(); setOpen(false); }}><X size={22} /></button><div><small>ASSISTANT VOCAL</small><h2>Créer avec l’IA</h2></div><span /></header>

      {stage === "choose" && <div className="mai-choices">
        <div className="mai-intro"><Mic size={28} /><strong>Que voulez-vous créer ?</strong><span>Choisissez le document, puis dictez simplement ce qu’il faut faire.</span></div>
        {choices.map(({ id, label, detail, icon: Icon }) => <button key={id} onClick={() => choose(id)}><span><Icon size={23} /></span><div><strong>{label}</strong><small>{detail}</small></div></button>)}
      </div>}

      {stage !== "choose" && stage !== "review" && <div className="mai-capture">
        <span className="mai-target-label">{target === "quote" ? "NOUVEAU DEVIS" : target === "invoice" ? "NOUVELLE FACTURE" : "NOUVEAU CLIENT"}</span>
        <button className={`mai-mic ${stage === "recording" ? "recording" : ""}`} onClick={stage === "recording" ? stopRecording : () => void startRecording()} disabled={busy}>{busy ? <Loader2 size={34} className="mai-spin" /> : stage === "recording" ? <Square size={30} /> : <Mic size={38} />}</button>
        <h3>{stage === "recording" ? "Je vous écoute…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "Préparation…" : "Appuyez et dictez"}</h3>
        <p>{stage === "recording" ? "Appuyez de nouveau pour terminer." : "Parlez naturellement, comme sur le chantier."}</p>
        <textarea value={transcript} onChange={(event) => updateTranscript(event.target.value)} placeholder={target === "customer" ? "Ex. Société Martin, SIRET…, téléphone…, adresse…" : "Ex. Client Dupont, peinture 18 m² à 32 euros, TVA 10 %."} />
        {message && <div className="mai-message">{message}</div>}
        {(stage === "ready" || stage === "error") && transcript.trim() && <button className="mai-primary" onClick={() => void analyse(transcriptRef.current, targetRef.current!)}>Analyser et préparer</button>}
        {(stage === "ready" || stage === "error") && <button className="mai-secondary" onClick={() => { targetRef.current = null; setTarget(null); setStage("choose"); }}>Changer de document</button>}
      </div>}

      {stage === "review" && parsed && <div className="mai-review">
        <div className="mai-success"><Check size={22} /><div><strong>Informations reconnues</strong><small>{provider || "Analyse terminée"} · à vérifier</small></div></div>
        {customerData && <div className="mai-review-card"><strong>{customerData.company_name || [customerData.civility, customerData.last_name, customerData.first_name].filter(Boolean).join(" ") || "Client à compléter"}</strong><span>{[customerData.phone1, customerData.email1].filter(Boolean).join(" · ")}</span><small>{[customerData.line1, customerData.postal_code, customerData.city].filter(Boolean).join(", ")}</small></div>}
        {documentData && <div className="mai-review-card mai-lines"><strong>{documentData.title || "Document préparé"}</strong><span>{documentData.customer_hint || "Client à sélectionner"}</span>{(documentData.items ?? []).map((item, index) => <div key={`${item.label}-${index}`}><span><b>{item.label || "Ligne à compléter"}</b><small>{item.quantity ?? 1} {item.unit || "u"} · TVA {item.tax_rate ?? 20} %</small></span><strong>{euro(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))}</strong></div>)}</div>}
        <button className="mai-primary" onClick={() => void apply()}>Ouvrir le formulaire prérempli</button>
        <button className="mai-secondary" onClick={() => { setParsed(null); setStage("ready"); }}>Corriger la dictée</button>
      </div>}
    </section>
  </div>;
}
