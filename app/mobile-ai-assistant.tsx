"use client";

import {
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

type Target = "quote" | "invoice" | "customer";
type Stage = "choose" | "ready" | "recording" | "transcribing" | "analysing" | "review" | "error";

type RecognitionResultEvent = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }>;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionLike;

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
  notes?: string;
  warnings?: string[];
};

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
  site_address?: string;
  items?: ParsedLine[];
  warnings?: string[];
};

type ParsedResult = ParsedCustomer | ParsedDocument;

const TARGETS: Array<{
  id: Target;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  { id: "quote", label: "Un devis", description: "Client, prestations, quantités, prix et TVA", icon: FileText },
  { id: "invoice", label: "Une facture", description: "Prestations, échéance et règlement", icon: ReceiptText },
  { id: "customer", label: "Un client", description: "Coordonnées, adresse, SIRET et TVA", icon: UserRound },
];

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function nativeSetValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function waitForElement<T extends Element>(selector: string, timeout = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const element = document.querySelector<T>(selector);
      if (element) {
        window.clearInterval(timer);
        resolve(element);
      } else if (Date.now() - started > timeout) {
        window.clearInterval(timer);
        reject(new Error("Le formulaire mobile n’a pas pu être ouvert."));
      }
    }, 50);
  });
}

export default function MobileAiAssistant() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("");
  const [groqReady, setGroqReady] = useState<boolean | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const transcriptRef = useRef("");

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopMedia = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopMedia();
    setTarget(null);
    setStage("choose");
    updateTranscript("");
    setParsed(null);
    setMessage("");
    setProvider("");
  }, [stopMedia, updateTranscript]);

  const close = useCallback(() => {
    stopMedia();
    setOpen(false);
  }, [stopMedia]);

  useEffect(() => {
    fetch("/api/ai/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { groq?: boolean }) => setGroqReady(Boolean(data.groq)))
      .catch(() => setGroqReady(false));
  }, []);

  useEffect(() => {
    const intercept = (event: Event) => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      const targetElement = event.target as Element | null;
      if (!targetElement?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      reset();
      setOpen(true);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [reset]);

  useEffect(() => () => stopMedia(), [stopMedia]);

  async function analyse(text = transcriptRef.current) {
    if (!target || !text.trim()) {
      setMessage("Aucune information n’a été reconnue. Vous pouvez aussi écrire dans la zone de texte.");
      setStage("ready");
      return;
    }
    setStage("analysing");
    setMessage("");
    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target === "customer" ? "customer" : "document",
          transcript: text,
          target,
        }),
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

  async function transcribe(blob: Blob) {
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
      await analyse(text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  function startBrowserRecognition() {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setMessage("Le micro n’est pas disponible dans ce navigateur. Écrivez la demande ci-dessous.");
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
      if (transcriptRef.current.trim()) void analyse(transcriptRef.current);
      else setStage("ready");
    };
    recognitionRef.current = recognition;
    setStage("recording");
    recognition.start();
  }

  async function startRecording() {
    setMessage("");
    updateTranscript("");
    setParsed(null);

    if (!groqReady || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      startBrowserRecognition();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
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
        void transcribe(blob);
      };
      recorder.start(250);
      setStage("recording");
    } catch {
      startBrowserRecognition();
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
  }

  function selectTarget(next: Target) {
    setTarget(next);
    setStage("ready");
    window.setTimeout(() => void startRecording(), 120);
  }

  async function applyToMobile() {
    if (!target || !parsed) return;
    try {
      const navLabel = target === "quote" ? "Devis" : target === "invoice" ? "Factures" : "Clients";
      const navButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button"))
        .find((button) => button.textContent?.includes(navLabel));
      navButton?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      document.querySelector<HTMLButtonElement>(".rm-create-main")?.click();
      const sheet = await waitForElement<HTMLElement>(".rm-create-sheet");

      if (target === "customer") {
        const customer = parsed as ParsedCustomer;
        if (customer.kind === "individual") {
          Array.from(sheet.querySelectorAll<HTMLButtonElement>(".rm-kind-switch button"))
            .find((button) => button.textContent?.includes("Particulier"))?.click();
        }
        const fields: Array<[string, string | undefined]> = [
          ["Nom de l’entreprise", customer.company_name],
          ["14 chiffres", customer.siret],
          ["FR…", customer.vat_number],
          ["E-mail principal", customer.email1],
          ["Second e-mail", customer.email2],
          ["Téléphone principal", customer.phone1],
          ["Second téléphone", customer.phone2],
          ["Adresse complète", [customer.line1, customer.postal_code, customer.city].filter(Boolean).join(", ")],
        ];
        fields.forEach(([placeholder, value]) => {
          if (!value) return;
          const input = Array.from(sheet.querySelectorAll<HTMLInputElement>("input"))
            .find((element) => element.placeholder === placeholder);
          if (input) nativeSetValue(input, value);
        });
      } else {
        const documentData = parsed as ParsedDocument;
        const cardValues = sheet.querySelectorAll<HTMLElement>(".rm-form-card strong");
        if (documentData.customer_hint && cardValues[0]) cardValues[0].textContent = documentData.customer_hint;

        sheet.querySelector(".mai-applied-lines")?.remove();
        const block = document.createElement("div");
        block.className = "mai-applied-lines";
        const heading = document.createElement("div");
        heading.className = "mai-applied-heading";
        const title = document.createElement("strong");
        title.textContent = documentData.title || "Prestations reconnues";
        const badge = document.createElement("span");
        badge.textContent = "IA · à vérifier";
        heading.append(title, badge);
        block.appendChild(heading);

        const items = documentData.items ?? [];
        items.forEach((item) => {
          const row = document.createElement("div");
          const text = document.createElement("span");
          const lineTitle = document.createElement("strong");
          lineTitle.textContent = item.label || "Ligne à compléter";
          const meta = document.createElement("small");
          meta.textContent = `${item.quantity ?? 1} ${item.unit || "u"} · TVA ${item.tax_rate ?? 20} %`;
          text.append(lineTitle, meta);
          const price = document.createElement("b");
          price.textContent = money(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0));
          row.append(text, price);
          block.appendChild(row);
        });

        const manualButton = sheet.querySelector(".rm-manual-line");
        manualButton?.before(block);

        const totalHt = items.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unit_price ?? 0), 0);
        const totalTax = items.reduce((sum, item) => {
          const line = Number(item.quantity ?? 1) * Number(item.unit_price ?? 0);
          return sum + line * Number(item.tax_rate ?? 20) / 100;
        }, 0);
        const footerSummary = sheet.querySelector<HTMLElement>("footer > div:first-child");
        const totalElement = footerSummary?.querySelector("strong");
        const taxElement = footerSummary?.querySelectorAll("small")[1];
        if (totalElement) totalElement.textContent = money(totalHt);
        if (taxElement) taxElement.textContent = `TVA : ${money(totalTax)}`;
      }

      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d’ouvrir le formulaire mobile.");
      setStage("error");
    }
  }

  if (!open) return null;

  const documentData = target && target !== "customer" && parsed ? parsed as ParsedDocument : null;
  const customerData = target === "customer" && parsed ? parsed as ParsedCustomer : null;
  const busy = stage === "transcribing" || stage === "analysing";

  return (
    <div className="mai-overlay" role="dialog" aria-modal="true" aria-label="Assistant IA mobile">
      <section className="mai-panel">
        <header>
          <button onClick={close} aria-label="Fermer"><X size={22} /></button>
          <div><small>ASSISTANT VOCAL</small><h2>Créer avec l’IA</h2></div>
          <span />
        </header>

        {stage === "choose" && (
          <div className="mai-choices">
            <div className="mai-intro"><Mic size={28} /><strong>Que voulez-vous créer ?</strong><span>Choisissez, puis dictez naturellement. L’IA prépare le formulaire.</span></div>
            {TARGETS.map(({ id, label, description, icon: Icon }) => (
              <button key={id} onClick={() => selectTarget(id)}>
                <span><Icon size={23} /></span>
                <div><strong>{label}</strong><small>{description}</small></div>
              </button>
            ))}
          </div>
        )}

        {stage !== "choose" && stage !== "review" && (
          <div className="mai-capture">
            <span className="mai-target-label">{target === "quote" ? "NOUVEAU DEVIS" : target === "invoice" ? "NOUVELLE FACTURE" : "NOUVEAU CLIENT"}</span>
            <button className={`mai-mic ${stage === "recording" ? "recording" : ""}`} onClick={stage === "recording" ? stopRecording : startRecording} disabled={busy}>
              {busy ? <Loader2 size={34} className="mai-spin" /> : stage === "recording" ? <Square size={30} /> : <Mic size={38} />}
            </button>
            <h3>{stage === "recording" ? "Je vous écoute…" : stage === "transcribing" ? "Transcription…" : stage === "analysing" ? "Création du document…" : "Dictez ce qu’il faut créer"}</h3>
            <p>{stage === "recording" ? "Appuyez de nouveau pour terminer." : "Vous pouvez parler comme sur le chantier, sans suivre un ordre précis."}</p>
            <textarea value={transcript} onChange={(event) => updateTranscript(event.target.value)} placeholder={target === "customer" ? "Ex. Société Martin Peinture, SIRET…, téléphone…, adresse…" : "Ex. Client Dupont, protection du chantier 180 euros HT, peinture 18 m² à 32 euros, TVA 10 %."} />
            {message && <div className="mai-message">{message}</div>}
            {(stage === "ready" || stage === "error") && transcript.trim() && <button className="mai-primary" onClick={() => void analyse()}>Analyser et préparer</button>}
            {(stage === "ready" || stage === "error") && <button className="mai-secondary" onClick={() => { setStage("choose"); setTarget(null); }}>Changer de document</button>}
          </div>
        )}

        {stage === "review" && parsed && (
          <div className="mai-review">
            <div className="mai-success"><Check size={22} /><div><strong>Informations reconnues</strong><small>{provider || "Analyse terminée"} · vérification obligatoire</small></div></div>
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
                  <div key={`${item.label}-${index}`}><span><b>{item.label || "Ligne à compléter"}</b><small>{item.quantity ?? 1} {item.unit || "u"} · TVA {item.tax_rate ?? 20} %</small></span><strong>{money(Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))}</strong></div>
                ))}
              </div>
            )}
            <button className="mai-primary" onClick={() => void applyToMobile()}>Ouvrir le formulaire prérempli</button>
            <button className="mai-secondary" onClick={() => { setParsed(null); setStage("ready"); }}>Corriger la dictée</button>
          </div>
        )}
      </section>
    </div>
  );
}
