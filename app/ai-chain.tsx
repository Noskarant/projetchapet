"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Mic,
  ReceiptText,
  RotateCcw,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Target = "customer" | "quote" | "invoice" | "current";
type ParseKind = "customer" | "document";
type Stage = "idle" | "recording" | "transcribing" | "analysing" | "review" | "applying";

type ApiStatus = {
  groq: boolean;
  deepseek: boolean;
  transcriptionModel: string;
  structuringModel: string;
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
  price_type?: "ht" | "ttc" | "unknown";
  confidence?: number;
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

const TARGETS: Array<{
  id: Target;
  label: string;
  description: string;
  icon: typeof UserRound;
}> = [
  {
    id: "quote",
    label: "Nouveau devis",
    description: "Client, chantier, prestations, quantités, prix et TVA.",
    icon: FileText,
  },
  {
    id: "customer",
    label: "Nouveau client",
    description: "Particulier ou société, coordonnées, adresse et SIRET.",
    icon: UserRound,
  },
  {
    id: "invoice",
    label: "Nouvelle facture",
    description: "Même saisie structurée qu’un devis, avec échéance.",
    icon: ReceiptText,
  },
  {
    id: "current",
    label: "Formulaire ouvert",
    description: "Remplit le client, devis ou facture actuellement affiché.",
    icon: WandSparkles,
  },
];

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function controlByLabel(container: Element, labelText: string) {
  const normalized = labelText.toLowerCase();
  const label = Array.from(container.querySelectorAll("label")).find((item) =>
    item.textContent?.toLowerCase().includes(normalized),
  );
  return label?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select",
  );
}

function fillControl(container: Element, labelText: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  const control = controlByLabel(container, labelText);
  if (control) setNativeValue(control, String(value));
}

function formKindFromDom(): Exclude<Target, "current"> | null {
  const title = document.querySelector(".pc-crud-modal h2")?.textContent ?? "";
  if (/client/i.test(title)) return "customer";
  if (/facture|facturer/i.test(title)) return "invoice";
  if (/devis/i.test(title)) return "quote";
  return null;
}

function findButtonByText(container: ParentNode, text: string) {
  const normalized = text.toLowerCase();
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.toLowerCase().includes(normalized),
  );
}

async function waitForElement<T extends Element>(
  selector: string,
  timeoutMs = 2500,
): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = document.querySelector<T>(selector);
    if (element) return element;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("Le formulaire n’a pas pu être ouvert.");
}

async function openTargetForm(target: Exclude<Target, "current">) {
  const existing = formKindFromDom();
  if (existing === target) return waitForElement<HTMLElement>(".pc-crud-modal");

  const navLabel =
    target === "customer" ? "Clients" : target === "quote" ? "Devis" : "Factures";
  const navButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".pc-sidebar nav button, .pc-mobile-nav button"),
  ).find((button) => button.textContent?.trim().toLowerCase().includes(navLabel.toLowerCase()));
  navButton?.click();

  await new Promise((resolve) => window.setTimeout(resolve, 120));

  const actionLabel =
    target === "customer"
      ? "Nouveau client"
      : target === "quote"
        ? "Nouveau devis"
        : "Nouvelle facture";
  const actionButton = findButtonByText(document, actionLabel);
  if (!actionButton) throw new Error(`Le bouton « ${actionLabel} » est introuvable.`);
  actionButton.click();
  return waitForElement<HTMLElement>(".pc-crud-modal");
}

async function fillForm(
  target: Target,
  data: ParsedResult,
): Promise<{ resolvedTarget: Exclude<Target, "current"> }> {
  const resolvedTarget =
    target === "current" ? formKindFromDom() : target;

  if (!resolvedTarget) {
    throw new Error("Aucun formulaire n’est ouvert. Choisissez client, devis ou facture.");
  }

  const modal =
    target === "current"
      ? await waitForElement<HTMLElement>(".pc-crud-modal")
      : await openTargetForm(resolvedTarget);

  if (resolvedTarget === "customer") {
    const customer = data as ParsedCustomer;
    const desiredKind = customer.kind === "individual" ? "Particulier" : "Professionnel";
    const kindButton = Array.from(
      modal.querySelectorAll<HTMLButtonElement>(".pc-segmented button"),
    ).find((button) => button.textContent?.includes(desiredKind));
    kindButton?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    fillControl(modal, "Raison sociale", customer.company_name);
    fillControl(modal, "Civilité", customer.civility);
    fillControl(modal, "Nom", customer.last_name);
    fillControl(modal, "Prénom", customer.first_name);
    fillControl(modal, "SIRET", customer.siret);
    fillControl(modal, "TVA intracommunautaire", customer.vat_number);
    fillControl(modal, "E-mail principal", customer.email1);
    fillControl(modal, "Second e-mail", customer.email2);
    fillControl(modal, "Téléphone principal", customer.phone1);
    fillControl(modal, "Second téléphone", customer.phone2);
    fillControl(modal, "Adresse", customer.line1);
    fillControl(modal, "Code postal", customer.postal_code);
    fillControl(modal, "Ville", customer.city);
    fillControl(modal, "Notes", customer.notes);
    return { resolvedTarget };
  }

  const document = data as ParsedDocument;
  if (resolvedTarget === "quote") {
    fillControl(modal, "Objet du devis", document.title);
  }
  fillControl(modal, "Notes", document.notes);

  if (document.customer_hint) {
    const select = controlByLabel(modal, "Client");
    if (select instanceof HTMLSelectElement) {
      const hint = document.customer_hint.toLowerCase();
      const option = Array.from(select.options).find((item) =>
        item.text.toLowerCase().includes(hint),
      );
      if (option) setNativeValue(select, option.value);
    }
  }

  const items = Array.isArray(document.items) ? document.items : [];
  const addButton = findButtonByText(modal, "Ajouter une ligne");
  while (modal.querySelectorAll(".pc-item-editor").length < items.length) {
    addButton?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  Array.from(modal.querySelectorAll<HTMLElement>(".pc-item-editor")).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    fillControl(row, "Désignation", item.label);
    fillControl(row, "Qté", item.quantity);
    fillControl(row, "Unité", item.unit);
    fillControl(row, "Prix unitaire", item.unit_price);
    fillControl(row, "TVA", item.tax_rate);
  });

  return { resolvedTarget };
}

function targetParseKind(target: Target): ParseKind {
  if (target === "customer") return "customer";
  if (target === "current" && formKindFromDom() === "customer") return "customer";
  return "document";
}

function targetTitle(target: Target) {
  if (target === "customer") return "Créer un client à la voix";
  if (target === "invoice") return "Créer une facture à la voix";
  if (target === "current") return "Remplir le formulaire ouvert";
  return "Créer un devis à la voix";
}

function transcriptExample(target: Target) {
  if (target === "customer") {
    return "Nouveau client professionnel, société Martin Peinture, SIRET 892 445 112 00018, téléphone 06 12 34 56 78, adresse 12 rue de la République, 42000 Saint-Étienne.";
  }
  return "Client Cabinet Giraud. Préparation et protection du chantier au forfait 180 euros HT, ratissage de 85 mètres carrés à 12 euros HT le mètre carré, deux couches de peinture mate à 18 euros HT le mètre carré, TVA 10 %.";
}

function CustomerReview({ data }: { data: ParsedCustomer }) {
  const rows = [
    ["Type", data.kind === "business" ? "Professionnel" : "Particulier"],
    ["Société", data.company_name],
    ["Nom", [data.civility, data.last_name, data.first_name].filter(Boolean).join(" ")],
    ["SIRET", data.siret],
    ["TVA", data.vat_number],
    ["E-mail", data.email1],
    ["Téléphone", data.phone1],
    ["Adresse", [data.line1, data.postal_code, data.city].filter(Boolean).join(", ")],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="pc-ai-review-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function DocumentReview({ data }: { data: ParsedDocument }) {
  return (
    <div className="pc-ai-document-review">
      <div className="pc-ai-review-grid">
        <div>
          <span>Client détecté</span>
          <strong>{data.customer_hint || "À sélectionner"}</strong>
        </div>
        <div>
          <span>Objet</span>
          <strong>{data.title || "À compléter"}</strong>
        </div>
      </div>
      <div className="pc-ai-lines">
        <div className="pc-ai-line pc-ai-line-head">
          <span>Prestation</span>
          <span>Quantité</span>
          <span>Prix HT</span>
          <span>TVA</span>
        </div>
        {(data.items ?? []).map((item, index) => (
          <div className="pc-ai-line" key={`${item.label}-${index}`}>
            <span>
              <strong>{item.label || "Ligne à compléter"}</strong>
              {item.description && <small>{item.description}</small>}
            </span>
            <span>
              {item.quantity ?? 0} {item.unit || ""}
            </span>
            <span>
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
              }).format(Number(item.unit_price ?? 0))}
            </span>
            <span>{item.tax_rate ?? 0} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiChain() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>("quote");
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [provider, setProvider] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const parseKind = useMemo(() => targetParseKind(target), [target, formOpen]);
  const warnings = useMemo(() => {
    if (!parsed || !("warnings" in parsed)) return [];
    return Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : [];
  }, [parsed]);

  const notify = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 5200);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      const data = (await response.json()) as ApiStatus;
      setStatus(data);
    } catch {
      setStatus({
        groq: false,
        deepseek: false,
        transcriptionModel: "whisper-large-v3-turbo",
        structuringModel: "deepseek-v4-flash",
      });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const check = () => setFormOpen(Boolean(document.querySelector(".pc-crud-modal form")));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const topButton = document.querySelector<HTMLButtonElement>(".pc-disabled-feature");
    if (!topButton) return;
    topButton.classList.remove("pc-disabled-feature");
    topButton.querySelector("span")?.replaceChildren(document.createTextNode("Mode IA"));
    const handler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      setOpen(true);
      if (formKindFromDom()) setTarget("current");
    };
    topButton.addEventListener("click", handler, true);
    return () => topButton.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    if (open && formKindFromDom()) setTarget("current");
  }, [open]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function reset() {
    setStage("idle");
    setTranscript("");
    setParsed(null);
    setProvider("");
  }

  function close() {
    if (stage === "recording") stopRecording();
    setOpen(false);
  }

  function startBrowserDictation() {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      notify("La dictée navigateur nécessite Chrome ou Edge. La transcription Groq reste disponible après configuration.");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Constructor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setTranscript((current) => `${current} ${text}`.trim());
    };
    recognition.onerror = (event) => {
      notify(event.error ? `Dictée interrompue : ${event.error}` : "Dictée interrompue.");
      setStage("idle");
    };
    recognition.onend = () => setStage((current) => (current === "recording" ? "idle" : current));
    recognitionRef.current = recognition;
    setStage("recording");
    recognition.start();
  }

  async function startGroqRecording() {
    if (!status?.groq) {
      notify("Ajoutez GROQ_API_KEY dans Vercel, ou utilisez la dictée navigateur en attendant.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notify("L’enregistrement audio n’est pas supporté sur cet appareil.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = mimeTypes.find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        void transcribeAudio(blob);
      };

      recorder.start(250);
      setStage("recording");
    } catch (error) {
      notify(
        error instanceof Error
          ? `Microphone inaccessible : ${error.message}`
          : "Microphone inaccessible.",
      );
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      return;
    }
    setStage("idle");
  }

  async function transcribeAudio(blob: Blob) {
    setStage("transcribing");
    try {
      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", new File([blob], `dictée.${extension}`, { type: blob.type }));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Transcription impossible.");
      const text = String(result.text ?? "").trim();
      if (!text) throw new Error("Aucun texte n’a été reconnu.");
      setTranscript((current) => `${current} ${text}`.trim());
      setProvider(result.provider ?? "Groq Whisper");
      setStage("idle");
      notify("Transcription terminée. Relisez puis lancez l’analyse.");
    } catch (error) {
      setStage("idle");
      notify(error instanceof Error ? error.message : "Transcription impossible.");
    }
  }

  async function analyse() {
    if (!transcript.trim()) {
      notify("Dictez ou écrivez d’abord les informations.");
      return;
    }
    setStage("analysing");
    setParsed(null);
    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: parseKind,
          transcript,
          target,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analyse impossible.");
      setParsed(result.data);
      setProvider(result.provider ?? "");
      setStage("review");
    } catch (error) {
      setStage("idle");
      notify(error instanceof Error ? error.message : "Analyse impossible.");
    }
  }

  async function apply() {
    if (!parsed) return;
    setStage("applying");
    try {
      const { resolvedTarget } = await fillForm(target, parsed);
      setStage("review");
      notify(
        `Formulaire ${resolvedTarget === "customer" ? "client" : resolvedTarget === "quote" ? "devis" : "facture"} prérempli. Contrôlez chaque donnée avant d’enregistrer.`,
      );
      setOpen(false);
    } catch (error) {
      setStage("review");
      notify(error instanceof Error ? error.message : "Préremplissage impossible.");
    }
  }

  const isBusy = ["transcribing", "analysing", "applying"].includes(stage);

  return (
    <>
      <button
        className="pc-ai-launcher"
        onClick={() => {
          setOpen(true);
          if (formKindFromDom()) setTarget("current");
        }}
        aria-label="Ouvrir le mode IA"
      >
        <Sparkles size={19} />
        <span>Mode IA</span>
      </button>

      {open && <button className="pc-ai-backdrop" onClick={close} aria-label="Fermer" />}

      {open && (
        <aside className="pc-ai-panel" role="dialog" aria-modal="true" aria-label="Mode IA">
          <header className="pc-ai-header">
            <div>
              <span>Assistant de saisie</span>
              <h2>{targetTitle(target)}</h2>
              <p>
                Audio → transcription Groq → structuration DeepSeek → contrôle humain → formulaire.
              </p>
            </div>
            <button onClick={close} aria-label="Fermer">
              <X size={20} />
            </button>
          </header>

          <div className="pc-ai-provider-status">
            <div className={status?.groq ? "ready" : "missing"}>
              <span>1</span>
              <strong>Voix</strong>
              <small>
                {status?.groq ? status.transcriptionModel : "Clé Groq à ajouter"}
              </small>
            </div>
            <ChevronRight size={16} />
            <div className={status?.deepseek ? "ready" : "missing"}>
              <span>2</span>
              <strong>Analyse</strong>
              <small>
                {status?.deepseek ? status.structuringModel : "Fallback local"}
              </small>
            </div>
            <ChevronRight size={16} />
            <div className="ready">
              <span>3</span>
              <strong>Formulaire</strong>
              <small>Relecture obligatoire</small>
            </div>
          </div>

          {!parsed && (
            <>
              <section className="pc-ai-targets">
                <div className="pc-ai-section-title">
                  <span>Action</span>
                  <strong>Que voulez-vous remplir ?</strong>
                </div>
                <div className="pc-ai-target-grid">
                  {TARGETS.map(({ id, label, description, icon: Icon }) => {
                    const disabled = id === "current" && !formOpen;
                    return (
                      <button
                        key={id}
                        className={target === id ? "active" : ""}
                        disabled={disabled}
                        onClick={() => {
                          setTarget(id);
                          setParsed(null);
                        }}
                      >
                        <Icon size={18} />
                        <span>
                          <strong>{label}</strong>
                          <small>
                            {disabled ? "Ouvrez d’abord un formulaire." : description}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="pc-ai-capture">
                <div className="pc-ai-section-title">
                  <span>Dictée</span>
                  <strong>Parlez naturellement, comme sur le chantier</strong>
                </div>
                <textarea
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  placeholder={transcriptExample(target)}
                  disabled={isBusy}
                />
                <div className="pc-ai-capture-actions">
                  {stage === "recording" ? (
                    <button className="pc-ai-stop" onClick={stopRecording}>
                      <Square size={16} />
                      Arrêter l’écoute
                    </button>
                  ) : (
                    <>
                      <button
                        className="pc-ai-record"
                        onClick={startGroqRecording}
                        disabled={isBusy}
                      >
                        <Mic size={17} />
                        Enregistrer avec Groq
                      </button>
                      <button
                        className="pc-ai-browser"
                        onClick={startBrowserDictation}
                        disabled={isBusy}
                      >
                        <Mic size={17} />
                        Dictée navigateur
                      </button>
                    </>
                  )}
                </div>
                {stage === "recording" && (
                  <div className="pc-ai-listening">
                    <i />
                    Écoute en cours… dictez les informations puis arrêtez.
                  </div>
                )}
                {stage === "transcribing" && (
                  <div className="pc-ai-progress">
                    <Loader2 className="pc-spin" size={17} />
                    Groq transcrit l’audio…
                  </div>
                )}
              </section>

              <div className="pc-ai-main-actions">
                <button className="pc-ai-reset" onClick={reset} disabled={isBusy}>
                  <RotateCcw size={16} />
                  Effacer
                </button>
                <button
                  className="pc-primary"
                  onClick={analyse}
                  disabled={isBusy || !transcript.trim() || stage === "recording"}
                >
                  {stage === "analysing" ? (
                    <Loader2 className="pc-spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  Analyser et structurer
                </button>
              </div>
            </>
          )}

          {parsed && (
            <section className="pc-ai-review">
              <div className="pc-ai-review-heading">
                <div>
                  <span>Résultat à contrôler</span>
                  <h3>Le formulaire n’est pas encore enregistré</h3>
                </div>
                <button onClick={() => setParsed(null)}>
                  <RotateCcw size={15} />
                  Refaire
                </button>
              </div>

              {parseKind === "customer" ? (
                <CustomerReview data={parsed as ParsedCustomer} />
              ) : (
                <DocumentReview data={parsed as ParsedDocument} />
              )}

              {warnings.length > 0 && (
                <div className="pc-ai-warnings">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{warnings.length} point(s) à vérifier</strong>
                    <ul>
                      {warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="pc-ai-provider-note">
                <Check size={15} />
                Traitement : {provider || "analyse locale"}. Aucun document n’est envoyé automatiquement.
              </div>

              <button className="pc-primary pc-ai-apply" onClick={apply} disabled={stage === "applying"}>
                {stage === "applying" ? (
                  <Loader2 className="pc-spin" size={17} />
                ) : (
                  <WandSparkles size={17} />
                )}
                Préremplir le formulaire
              </button>
            </section>
          )}
        </aside>
      )}

      {message && (
        <div className="pc-ai-toast">
          <Check size={17} />
          {message}
        </div>
      )}
    </>
  );
}
