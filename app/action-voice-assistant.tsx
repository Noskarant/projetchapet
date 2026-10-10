"use client";

import { authenticatedAiFetch } from "@/lib/authenticated-ai-fetch";
import { microphoneErrorMessage } from "@/lib/microphone-error";
import { canCreateDirectly } from "@/lib/voice-direct-creation";

import ManufeoMascot from "./manufeo-mascot";

import { FIELD_INTERFACE_QUERY } from "@/lib/responsive-interface";

import {
  CalendarDays,
  Camera,
  Check,
  FileText,
  Loader2,
  Mail,
  Mic,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Paperclip,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  executeVoiceActions,
  listExecutedVoiceActions,
  listVoiceEmailDeliveries,
  listVoiceEmailQuoteChoices,
  planVoiceActions,
  extractQuoteSources,
  sendVoiceEmailDraft,
  type ActionExecutionResult,
  type ActionProposalView,
  type VoiceEmailQuoteChoice,
} from "@/lib/action-client";
import type { VoiceActionTarget } from "@/lib/action-planner";
import { getActiveOrganizationId } from "@/lib/project-chapet";
import { normalizeVoiceTranscript } from "@/lib/voice-facts";
import { isStandaloneTradeAnalysis } from "@/lib/voice-copilot-routing";
import { voiceEmailDraft, type VoiceEmailDraft } from "@/lib/voice-action-history";
import type { VoiceEmailDelivery } from "@/lib/voice-email-delivery";
import { CommandPrecisionGuide, VoiceListeningVisualizer, VoicePreviewButton, VoiceProcessingVisualizer, VoiceStartingVisualizer } from "./action-voice-experience";
import { audioPeak, encodeMonoWav, mergeFloat32Buffers } from "./mobile-audio";
import "./action-voice-assistant.css";
import "./action-voice-replay.css";
import { richNoteContent, insertCopiedText, readClipboardNote } from '@/lib/quote-source-clipboard';
import { readQuoteSourceFiles } from '@/lib/quote-source-files';
import { quoteSourceRequest, customerSourceRequest, sourceRequestTarget, MAX_QUOTE_SOURCES, MAX_SOURCE_OBSERVATIONS, type QuoteSource } from '@/lib/quote-sources';
import { documentUnit } from '@/lib/document-units';
import { supplierMarkupInput } from '@/lib/supplier-markup';

type Stage = "choose" | "ready" | "requesting" | "recording" | "transcribing" | "analysing" | "review" | "executing" | "success" | "drafts" | "send" | "error";

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
  { id: "supplier", label: "Un fournisseur", detail: "Nom, contact, e-mail, téléphone et adresse", icon: ShoppingCart },
  { id: "agenda", label: "Agenda", detail: "Rendez-vous, intervention ou relance", icon: CalendarDays },
];

const intentLabels: Record<string, string> = {
  create_customer: "Créer le client",
  create_collaborator: "Créer le collaborateur",
  create_supplier: "Créer le fournisseur",
  create_project: "Créer le chantier",
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

function quantityLabel(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(amount);
}

function proposalSummary(proposal: ActionProposalView) {
  const payload = proposal.payload ?? {};
  if (proposal.intent_type === "create_customer") {
    const name = clean(payload.company_name) || [payload.civility, payload.last_name, payload.first_name].map(clean).filter(Boolean).join(" ") || "Client à compléter";
    const emails = Array.isArray(payload.emails) ? payload.emails.map(clean).filter(Boolean) : [];
    const phones = Array.isArray(payload.phones) ? payload.phones.map(clean).filter(Boolean) : [];
    const addresses = Array.isArray(payload.addresses) ? payload.addresses.map(entry => { const address = entry as Record<string, unknown>; return [address.line1, address.postal_code, address.city].map(clean).filter(Boolean).join(" "); }) : [];
    return [name, clean(payload.siret) ? `SIRET ${clean(payload.siret)}` : "", ...emails, ...phones, ...addresses, clean(payload.notes)].filter(Boolean).join(" · ");
  }
  if (proposal.intent_type === "create_supplier") {
    return [clean(payload.name), clean(payload.contact), clean(payload.email), clean(payload.phone), clean(payload.address)].filter(Boolean).join(" · ");
  }
  if (proposal.intent_type === "create_project") {
    const names = [...(Array.isArray(payload.collaborator_names) ? payload.collaborator_names : []), ...(Array.isArray(payload.collaborator_new_names) ? payload.collaborator_new_names : [])];
    const team = names.map(clean).filter(Boolean).join(", ");
    return [clean(payload.name), clean(payload.customer_hint), clean(payload.address), team ? `Équipe : ${team}` : ""].filter(Boolean).join(" · ");
  }
  if (proposal.intent_type === "create_collaborator") {
    return [clean(payload.name), clean(payload.role), clean(payload.phone)].filter(Boolean).join(" · ");
  }
  if (proposal.intent_type === "prepare_quote" || proposal.intent_type === "prepare_invoice") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const client = clean(payload.customer_hint) || (payload.customer_from_proposal_id ? "Nouveau client de cette demande" : "Client à préciser");
    const lineDetails = items.slice(0, 6).map((entry) => {
      const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const label = clean(row.label) || "Prestation";
      const quantity = row.quantity === null || row.quantity === undefined ? "qté ?" : `${quantityLabel(row.quantity)}${documentUnit(row.unit) ? ` ${documentUnit(row.unit)}` : ""}`;
      const price = row.unit_price === null || row.unit_price === undefined
        ? row.spoken_price_ttc !== null && row.spoken_price_ttc !== undefined ? `${euro(row.spoken_price_ttc)} TTC · TVA à préciser`
          : row.spoken_price_ambiguous !== null && row.spoken_price_ambiguous !== undefined ? `${euro(row.spoken_price_ambiguous)} · HT/TTC à préciser`
            : "prix ?"
        : `${euro(row.unit_price)} ${row.price_type === "unknown" ? "(HT supposé)" : "HT"}`;
      const tax = row.tax_rate === null || row.tax_rate === undefined ? "TVA ?" : `TVA ${row.tax_rate} %`;
      return `${label}: ${quantity} × ${price} (${tax})`;
    });
    const extra = items.length > 6 ? `+ ${items.length - 6} autre${items.length - 6 > 1 ? "s" : ""} ligne${items.length - 6 > 1 ? "s" : ""}` : "";
    const discount = Number(payload.discount_percent || 0);
    return [client, ...lineDetails, extra, discount > 0 ? `Remise : ${discount} %` : '', clean(payload.notes)].filter(Boolean).join(" · ") || `${client} · aucune prestation`;
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

function missingLabel(field: string) {
  const labels: Record<string, string> = {
    email_client: "Adresse e-mail du client incorrecte. Vérifiez le @ et le domaine.",
    destinataire: "Adresse e-mail du destinataire incorrecte. Vérifiez le @ et le domaine.",
    client: "Client à préciser.",
    client_introuvable: "Client introuvable.",
    client_ambigu: "Plusieurs clients correspondent : précisez lequel.",
    prestations: "Décrivez au moins une prestation.",
    quantite: "Quantité à préciser.",
    date: "Date à préciser ou à corriger.",
    heure: "Heure à préciser ou à corriger.",
    nom_client: "Nom du client à préciser.",
    nom_chantier: "Nom du chantier à préciser.",
    nom_fournisseur: "Nom du fournisseur à préciser.",
    email_fournisseur_invalide: "L’e-mail du fournisseur doit être corrigé avant la création.",
    nom_collaborateur: "Nom du collaborateur à préciser.",
    objet: "Objet à préciser.",
    message: "Message à préciser.",
    raison_sociale: "Nom de l’entreprise cliente à préciser.",
    email_fournisseur: "Adresse e-mail du fournisseur incorrecte ou manquante.",
    montant: "Montant à préciser.",
    facture: "Facture à préciser.",
    chantier: "Chantier à préciser.",
    note: "Texte de la note à préciser.",
  };
  if (field.startsWith("collaborateur_introuvable: ")) return `Collaborateur introuvable : ${field.slice("collaborateur_introuvable: ".length)}. Précisez son nom ou créez sa fiche.`;
  if (field.startsWith("collaborateur_ambigu: ")) return `Plusieurs collaborateurs correspondent à ${field.slice("collaborateur_ambigu: ".length)}. Précisez son nom complet.`;
  if (field.startsWith("collaborateur_deja_existant: ")) return `Le collaborateur ${field.slice("collaborateur_deja_existant: ".length)} existe déjà. Demandez son affectation sans créer une nouvelle fiche.`;
  return labels[field] ?? field.replaceAll("_", " ");
}

function placeholder(target: VoiceActionTarget | null) {
  if (target === "command") return "Ex. Crée un chantier Peinture Dupont, affecte Lucas, prépare un devis pour 80 m² à 22 € HT et planifie une visite jeudi à 14 h.";
  if (target === "supplier") return "Ex. Crée le fournisseur Tollens, contact Julie, e-mail julie arobase tollens point fr, téléphone 04…, adresse… Vous pouvez épeler l’e-mail lettre par lettre.";
  if (target === "customer") return "Ex. Société Martin Peinture, téléphone…, adresse… Pour l’e-mail, dites chaque lettre, puis « point » ou « arobase ».";
  if (target === "agenda") return "Ex. Mets une visite mardi prochain à 14 h chez Dupont.";
  return "Ex. Client Dupont, peinture 18 m² à 32 € HT, TVA 10 %.";
}

async function parseSingleTarget(target: Exclude<VoiceActionTarget, "command">, transcript: string, signal: AbortSignal) {
  const agenda = target === "agenda";
  const response = await authenticatedAiFetch(agenda ? "/api/ai/agenda" : "/api/ai/parse", {
    method: "POST",
    signal,
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
  const [customerImport, setCustomerImport] = useState(false);
  const customerImportRef = useRef(false);
  const [sources, setSources] = useState<QuoteSource[]>([]);
  const [copiedSource, setCopiedSource] = useState('');
  const copiedSourceRef = useRef('');
  const copiedSourceInput = useRef<HTMLTextAreaElement | null>(null);
  const [pasteHint, setPasteHint] = useState('');
  const [pasting, setPasting] = useState(false);

  async function pasteSource() {
    const generation = sourceGeneration.current;
    setPasting(true); setPasteHint('');
    try {
      if (!navigator.clipboard) throw new DOMException('Collage manuel requis.', 'NotAllowedError');
      const note = await readClipboardNote(navigator.clipboard);
      const value = note.text;
      if (generation !== sourceGeneration.current) return;
      if (!value.trim() && !note.files.length) throw new Error('Le presse-papiers ne contient ni texte ni photo accessible.');
      if (value.length > 10_000) throw new Error('Texte trop long. Copiez uniquement les passages utiles (10 000 caractères maximum).');
      copiedSourceRef.current = value; setCopiedSource(value); setSourcesChanged(true); sourceObservationsRef.current = ''; setMessage('');
      if (note.files.length) await addSources(note.files);
      setPasteHint(note.missingImages && !note.files.length ? 'Certaines photos ne sont pas transmises : exportez la note complète en PDF ou joignez-les.' : note.files.length ? 'Texte et photos ajoutés au même dossier.' : 'Texte ajouté. Joignez les photos si elles ne figurent pas dans les sources.');
    } catch (error) {
      if (generation !== sourceGeneration.current) return;
      setPasteHint(error instanceof Error && !['NotAllowedError', 'SecurityError', 'TypeError'].includes(error.name)
        ? error.message : 'Appuyez longtemps dans le champ puis choisissez Coller. Sur ordinateur : Ctrl+V ou ⌘V.');
    } finally { setPasting(false); if (generation === sourceGeneration.current) copiedSourceInput.current?.focus(); }
  }
  const [markupInput, setMarkupInput] = useState('');
  const markupInputRef = useRef('');
  const sourcesRef = useRef<QuoteSource[]>([]);
  const sourceObservationsRef = useRef<string>('');
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [sourcesChanged, setSourcesChanged] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceGeneration = useRef(0);
  const [plannedTranscript, setPlannedTranscript] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [proposals, setProposals] = useState<ActionProposalView[]>([]);
  const [results, setResults] = useState<ActionExecutionResult[]>([]);
  const [drafts, setDrafts] = useState<VoiceEmailDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, VoiceEmailDelivery>>({});
  const [emailReview, setEmailReview] = useState<{ id: string; recipient: string; subject: string; body: string; quoteId: string | null } | null>(null);
  const [emailQuotes, setEmailQuotes] = useState<VoiceEmailQuoteChoice[]>([]);
  const [emailSuggestedQuoteId, setEmailSuggestedQuoteId] = useState<string | null>(null);
  const [emailQuotesBusy, setEmailQuotesBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [explicitConfirmed, setExplicitConfirmed] = useState(false);
  const [groqReady, setGroqReady] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceActivity, setVoiceActivity] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState("");
  const recordingUrlRef = useRef("");
  const previousVoiceLevelRef = useRef(0);
  const transcriptRef = useRef("");
  const targetRef = useRef<VoiceActionTarget | null>(null);
  const pcmRef = useRef<PcmSession | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const captureGenerationRef = useRef(0);
  const previousInstructionsRef = useRef("");

  const updateTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  }, []);

  const stopCapture = useCallback(() => {
    captureGenerationRef.current++;
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    const session = pcmRef.current;
    pcmRef.current = null;
    setVoiceLevel(0);
    setVoiceActivity(0);
    previousVoiceLevelRef.current = 0;
    if (session) tearDown(session);
  }, []);

  const reset = useCallback((preset?: VoiceActionTarget | null) => {
    stopCapture();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = "";
    setRecordingUrl("");
    targetRef.current = preset ?? null;
    setTarget(preset ?? null);
    setStage(preset ? "ready" : "choose");
    updateTranscript("");
    previousInstructionsRef.current = "";
    sourceGeneration.current++;
    sourcesRef.current = [];
    sourceObservationsRef.current = '';
    setSources([]);
    setCopiedSource(''); copiedSourceRef.current = ''; setPasteHint('');
    setMarkupInput(''); markupInputRef.current = '';
    setSourcesBusy(false);
    customerImportRef.current = false; setCustomerImport(false);
    setPlannedTranscript("");
    setEditing(false); setSourcesChanged(false);
    setMessage("");
    setProposals([]);
    setResults([]);
    setEmailReview(null);
    setEmailQuotes([]);
    setEmailSuggestedQuoteId(null);
    setEmailQuotesBusy(false);
    setEmailConfirmation("");
    setExplicitConfirmed(false);
  }, [stopCapture, updateTranscript]);

  const close = useCallback(() => {
    sourceGeneration.current++;
    const shouldRefresh = results.some((result) => result.entityId || result.entityType === "payment");
    stopCapture();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = "";
    setRecordingUrl("");
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
      if (!window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;
      const element = event.target as Element | null;
      if (element?.closest('.rm-client-sources')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        reset('customer'); customerImportRef.current = true; setCustomerImport(true); setOpen(true); return;
      }
      if (element?.closest('.rm-quote-sources')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        reset('quote'); setOpen(true); return;
      }
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      reset("command");
      setOpen(true);
      if (!element.closest('.rm-ai-create-text')) void startRecording();
    };
    const custom = (event: Event) => {
      const detail = (event as CustomEvent<{ target?: VoiceActionTarget; startListening?: boolean; importSource?: boolean }>).detail;
      const preset = detail?.target ?? "command";
      reset(preset);
      if (preset === "customer" && detail?.importSource) { customerImportRef.current = true; setCustomerImport(true); }
      setOpen(true);
      if (detail?.startListening) void startRecording();
    };
    const openDrafts = () => {
      reset("command");
      setOpen(true);
      void showDrafts();
    };
    document.addEventListener("click", mobileClick, true);
    window.addEventListener("projetchapet:open-ai", custom);
    window.addEventListener("manufeo:open-email-drafts", openDrafts);
    return () => {
      document.removeEventListener("click", mobileClick, true);
      window.removeEventListener("projetchapet:open-ai", custom);
      window.removeEventListener("manufeo:open-email-drafts", openDrafts);
    };
  }, [reset, groqReady]);

  useEffect(() => () => {
    stopCapture();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
  }, [stopCapture]);

  function choose(next: VoiceActionTarget) {
    if (next !== targetRef.current) { sourceObservationsRef.current = ''; }
    customerImportRef.current = false; setCustomerImport(false);
    if (next !== 'quote' && next !== 'command') {
      setCopiedSource(''); copiedSourceRef.current = ''; setPasteHint('');
      setMarkupInput(''); markupInputRef.current = '';
    }
    if (next !== 'quote' && next !== 'command' && next !== 'customer') {
      sourceGeneration.current++;
      sourcesRef.current = []; sourceObservationsRef.current = '';
      setSources([]); setSourcesBusy(false);
    }
    targetRef.current = next;
    setTarget(next);
    setStage("ready");
    setMessage("");
  }

  async function showDrafts(preferredId?: string) {
    setStage("drafts");
    setMessage("Chargement des brouillons…");
    try {
      const organizationId = await getActiveOrganizationId();
      const records = await listExecutedVoiceActions(organizationId, "prepare_email");
      const loaded = records.map(voiceEmailDraft).filter((draft): draft is VoiceEmailDraft => Boolean(draft));
      const sent = await listVoiceEmailDeliveries(organizationId, loaded.map((draft) => draft.id));
      setDrafts(loaded);
      setDeliveries(Object.fromEntries(sent.map((delivery) => [delivery.proposal_id, delivery])));
      setSelectedDraftId(preferredId && loaded.some((draft) => draft.id === preferredId) ? preferredId : loaded[0]?.id ?? null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brouillons indisponibles.");
    }
  }

  async function reviewDraft(draft: VoiceEmailDraft) {
    const previous = deliveries[draft.id];
    setEmailReview({
      id: draft.id,
      recipient: previous?.recipient ?? draft.to,
      subject: previous?.subject ?? draft.subject,
      body: previous?.body ?? draft.body,
      quoteId: previous?.attachment_quote_id ?? null,
    });
    setEmailQuotes([]);
    setEmailSuggestedQuoteId(null);
    setMessage("");
    setStage("send");
    if (previous) return;

    setEmailQuotesBusy(true);
    try {
      const organizationId = await getActiveOrganizationId();
      const available = await listVoiceEmailQuoteChoices(organizationId, draft.id);
      setEmailQuotes(available.quotes);
      setEmailSuggestedQuoteId(available.suggestedQuoteId);
      if (available.suggestedQuoteId) {
        setEmailReview((current) => current?.id === draft.id
          ? { ...current, quoteId: available.suggestedQuoteId }
          : current);
      }
    } catch (error) {
      setMessage(error instanceof Error
        ? `${error.message} L’e-mail peut toujours être envoyé sans pièce jointe.`
        : "Les devis disponibles n’ont pas pu être chargés. L’e-mail peut toujours être envoyé sans pièce jointe.");
    } finally {
      setEmailQuotesBusy(false);
    }
  }

  async function sendReviewedEmail() {
    if (!emailReview || emailBusy) return;
    setEmailBusy(true);
    setMessage("");
    try {
      const organizationId = await getActiveOrganizationId();
      const result = await sendVoiceEmailDraft({
        organizationId,
        proposalId: emailReview.id,
        subject: emailReview.subject,
        message: emailReview.body,
        quoteId: emailReview.quoteId,
      });
      const now = new Date().toISOString();
      setDeliveries((current) => ({ ...current, [emailReview.id]: {
        proposal_id: emailReview.id, recipient: emailReview.recipient.toLowerCase(), subject: emailReview.subject.trim(), body: emailReview.body.trim(),
        status: "sent", provider_id: result.providerId, sent_at: result.sentAt,
        attachment_quote_id: result.attachmentQuoteId, attachment_filename: result.attachmentFilename,
        created_at: current[emailReview.id]?.created_at ?? now, updated_at: now,
      } }));
      setStage("drafts");
      setEmailConfirmation("E-mail envoyé depuis MANUFEO.");
    } catch (error) {
      try {
        const organizationId = await getActiveOrganizationId();
        const [latest] = await listVoiceEmailDeliveries(organizationId, [emailReview.id]);
        if (latest) {
          setDeliveries((current) => ({ ...current, [latest.proposal_id]: latest }));
          setEmailReview({
            id: latest.proposal_id,
            recipient: latest.recipient,
            subject: latest.subject,
            body: latest.body,
            quoteId: latest.attachment_quote_id,
          });
          if (latest.status === "sent") {
            setStage("drafts");
            setEmailConfirmation("E-mail envoyé depuis MANUFEO.");
            return;
          }
        }
      } catch { /* L’état pourra être relu depuis la liste des brouillons. */ }
      setMessage(error instanceof Error ? error.message : "Envoi non confirmé. Vérifiez l’état du brouillon avant de réessayer.");
    } finally {
      setEmailBusy(false);
    }
  }

  function showCreatedAgenda() {
    window.sessionStorage.setItem("manufeo:show-voice-agenda", "1");
    window.dispatchEvent(new Event("manufeo:open-voice-agenda"));
    close();
  }

  async function prepare(text: string) {
    const selected = targetRef.current;
    const withFiles = sourcesRef.current.length > 0;
    const copied = selected === 'quote' || selected === 'command' || selected === 'customer' ? copiedSourceRef.current.trim() : '';
    const clientSources = Boolean(selected && sourceRequestTarget(selected, text) === "customer") && (withFiles || Boolean(copied) || customerImportRef.current);
    const withSources = withFiles || clientSources || Boolean(copied);
    if (!selected || (!text.trim() && !withFiles && !copied)) {
      setMessage("Dictez ou écrivez d’abord votre demande.");
      setStage("ready");
      return;
    }
    let normalized = normalizeVoiceTranscript(text);
    updateTranscript(normalized);
    if (!withSources && isStandaloneTradeAnalysis(normalized)) {
      close();
      window.dispatchEvent(new CustomEvent("manufeo:analyse-chantier", { detail: { description: normalized } }));
      return;
    }
    setStage("analysing");
    setMessage("");
    setProposals([]);
    setExplicitConfirmed(false);
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), withSources ? 110_000 : 35_000);
    try {
      const organizationId = await getActiveOrganizationId();
      const markup = selected === 'quote' || selected === 'command' ? supplierMarkupInput(markupInputRef.current) : null;
      if (withSources) {
        if (withFiles && !sourceObservationsRef.current) {
          const extraction = await extractQuoteSources(organizationId, sourcesRef.current, controller.signal);
          if (controller.signal.aborted) return;
          sourceObservationsRef.current = extraction.observations;
        }
        const observations = [copied ? `Début de la note artisan :\n${copied}\nFin de la note artisan` : '', sourceObservationsRef.current].filter(Boolean).join('\n\n');
        if (observations.length > MAX_SOURCE_OBSERVATIONS) throw new Error('Sources trop longues. Collez ou joignez uniquement les passages utiles.');
        normalized = clientSources ? customerSourceRequest(text, observations) : quoteSourceRequest(text, observations, markup);
      } else if (markup !== null) {
        normalized += `\nMajoration commerciale : ${markup} %.`;
      }
      const parsed = withSources || selected === "command" || selected === "supplier" ? undefined : await parseSingleTarget(selected, normalized, controller.signal);
      const planned = await planVoiceActions({
        organizationId,
        transcript: normalized,
        target: withSources ? 'command' : selected,
        parsed,
        signal: controller.signal,
        quoteSources: withSources && !clientSources,
        sourceTarget: withSources ? clientSources ? "customer" : "quote" : undefined,
      });
      if (controller.signal.aborted) return;
      if (!planned.proposals.length) throw new Error("Aucune action exploitable n’a été reconnue.");
      setProposals(planned.proposals);
      setPlannedTranscript(withSources ? normalizeVoiceTranscript(text) : normalized);
      setEditing(false); setSourcesChanged(false);
      if (!withSources && planned.proposals.every(canCreateDirectly)) {
        const ready = new Set(planned.proposals.filter(proposal => proposal.status === "ready" && !proposal.missing_fields.length).map(proposal => proposal.id));
        for (const proposal of planned.proposals) {
          const dependencies = [proposal.payload.customer_from_proposal_id, proposal.payload.quote_from_proposal_id, ...(Array.isArray(proposal.payload.collaborator_from_proposal_ids) ? proposal.payload.collaborator_from_proposal_ids : [])].filter(Boolean);
          if (dependencies.some(id => !ready.has(String(id)))) ready.delete(proposal.id);
        }
        const creatable = planned.proposals.filter(proposal => ready.has(proposal.id));
        if (!creatable.length) throw new Error(planned.proposals.flatMap(proposal => proposal.missing_fields.map(missingLabel)).join(" ") || "Décrivez ce que vous souhaitez créer.");
        const remaining = planned.proposals.filter(proposal => !ready.has(proposal.id));
        await createPlanned(creatable, organizationId, true, remaining.length ? `À compléter : ${remaining.flatMap(proposal => proposal.missing_fields.map(missingLabel)).join(" ")}` : "");
      } else {
        if (withSources) setMessage(clientSources ? 'Vérifiez les coordonnées lues avant de créer le client.' : 'Brouillon issu de vos sources : vérifiez le client, les prestations, mesures et prix de vente avant de créer le devis.');
        setStage("review");
      }
    } catch (error) {
      if (analysisControllerRef.current !== controller) return;
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

  async function addSources(files: File[]) {
    if (!files.length) return;
    const generation = ++sourceGeneration.current;
    setSourcesBusy(true); setMessage('');
    try {
      const added = await readQuoteSourceFiles(files);
      if (sourceGeneration.current !== generation) return;
      const next = [...sourcesRef.current, ...added];
      if (next.length > MAX_QUOTE_SOURCES) throw new Error('Maximum 12 photos ou pages au total. Retirez une source avant d’en ajouter.');
      if (next.reduce((sum, source) => sum + (source.image?.length || 0), 0) > 3_600_000) throw new Error('Dossier trop volumineux. Réduisez la taille des photos ou joignez-le en plusieurs parties.');
      if (next.reduce((sum, source) => sum + (source.text?.length || 0), 0) > 10_000) throw new Error('Documents trop longs. Joignez uniquement les pages utiles.');
      sourcesRef.current = next; sourceObservationsRef.current = '';
      setSources(next); setSourcesChanged(true);
    } catch (error) { if (sourceGeneration.current === generation) setMessage(error instanceof Error && !['TypeError', 'ReferenceError'].includes(error.name) ? error.message : 'Ce fichier n’a pas pu être lu. Réessayez avec un PDF, une photo JPEG/PNG ou collez son texte dans le champ ci-dessous.'); }
    finally { if (sourceGeneration.current === generation) setSourcesBusy(false); }
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
      if (recognitionRef.current !== recognition) return;
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) updateTranscript([previousInstructionsRef.current, text].filter(Boolean).join('\n'));
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setVoiceLevel(0);
      setMessage(microphoneErrorMessage(event.error, navigator.userAgent) ?? "La dictée a été interrompue. Réessayez ou écrivez votre demande.");
      setStage("ready");
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
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
    if (pcmRef.current || recognitionRef.current) return;
    const generation = ++captureGenerationRef.current;
    previousInstructionsRef.current = transcriptRef.current.trim();
    setMessage("");
    setVoiceLevel(0);
    setVoiceActivity(0);
    previousVoiceLevelRef.current = 0;
    setProposals([]);
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = "";
    setRecordingUrl("");
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
      // Both calls begin inside the tap: Safari must not wait for resume before requesting the microphone.
      const resumed = context.resume().then(() => null, error => error);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      if (generation !== captureGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        void context.close().catch(() => undefined);
        return;
      }
      const resumeError = await resumed;
      if (resumeError) throw resumeError;
      if (generation !== captureGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        void context.close().catch(() => undefined);
        return;
      }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        buffers.push(chunk);
        const peak = audioPeak(chunk);
        const normalized = Math.min(1, Math.max(0, (peak - 0.004) / 0.105));
        const delta = Math.abs(normalized - previousVoiceLevelRef.current);
        const activity = Math.min(1, normalized * 0.7 + delta * 2.4);
        previousVoiceLevelRef.current = normalized;
        setVoiceLevel((current) => Math.max(normalized, current * 0.48));
        setVoiceActivity((current) => Math.max(activity, current * 0.42));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      pcmRef.current = { context, source, processor, silentGain, stream, buffers, sampleRate: context.sampleRate };
      setStage("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => undefined);
      if (generation !== captureGenerationRef.current) return;
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
    const session = pcmRef.current;
    if (!session) {
      recognitionRef.current?.stop();
      return;
    }
    pcmRef.current = null;
    setVoiceLevel(0);
    setVoiceActivity(0);
    previousVoiceLevelRef.current = 0;
    setStage("transcribing");
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    tearDown(session);
    const samples = mergeFloat32Buffers(session.buffers);
    const duration = samples.length / session.sampleRate;
    if (duration < 0.15 || audioPeak(samples) < 0.0005) {
      setMessage("Le micro n’a pas capté votre voix. Vérifiez l’autorisation du micro et réessayez.");
      setStage("ready");
      return;
    }
    try {
      const blob = encodeMonoWav(samples, session.sampleRate);
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = URL.createObjectURL(blob);
      setRecordingUrl(recordingUrlRef.current);
      const form = new FormData();
      form.append("file", new File([blob], "dictee.wav", { type: "audio/wav" }));
      const response = await authenticatedAiFetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Transcription impossible.");
      const recognized = clean(result.text);
      if (!recognized) throw new Error("Aucun texte reconnu.");
      const text = [previousInstructionsRef.current, recognized].filter(Boolean).join('\n');
      await prepare(text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transcription impossible.");
      setStage("error");
    }
  }

  async function createPlanned(planned: ActionProposalView[], organizationId: string, directCreation = true, remainingMessage = "") {
    setStage("executing");
    const request = { organizationId, proposalIds: planned.map(proposal => proposal.id), explicitConfirmation: directCreation ? false : explicitConfirmed, directCreation };
    let execution: Awaited<ReturnType<typeof executeVoiceActions>>;
    try { execution = await executeVoiceActions(request); }
    catch (error) {
      if (!directCreation || !(error instanceof TypeError)) throw error;
      // A lost response may follow a successful save. Reuse proposal IDs so the
      // server returns their recorded results rather than creating a second copy.
      await new Promise(resolve => window.setTimeout(resolve, 400));
      execution = await executeVoiceActions(request);
    }
    setResults(execution.results);
    window.dispatchEvent(new CustomEvent("manufeo:workspace-changed", { detail: execution.results }));
    const created = execution.results.find(result => result.entityType === "quote")
      ?? execution.results.find(result => result.entityType === "invoice")
      ?? execution.results.find(result => result.entityType === "customer")
      ?? execution.results.find(result => result.entityType === "project")
      ?? execution.results[0];
    if (created && directCreation) {
      setOpen(false);
      window.dispatchEvent(new CustomEvent("manufeo:open-created-entity", { detail: { ...created, messages: [...execution.results.map(result => result.message), remainingMessage].filter(Boolean) } }));
    } else setStage("success");
  }

  async function execute() {
    if (!proposals.length) return;
    if (transcript !== plannedTranscript || sourcesChanged || sourcesBusy) {
      setMessage("La demande a changé. Relancez l’analyse avant de valider.");
      return;
    }
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
      await createPlanned(proposals, organizationId, false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Exécution impossible.");
      setStage("review");
    }
  }

  const busy = pasting || sourcesBusy || ["requesting", "transcribing", "analysing", "executing"].includes(stage);
  const sensitive = proposals.some((proposal) => proposal.risk_level === "explicit_confirmation");
  const learnedPrices = proposals.filter(proposal => proposal.intent_type === 'prepare_quote').flatMap(proposal =>
    Array.isArray(proposal.payload?.items) ? (proposal.payload.items as Array<Record<string, unknown>>).filter(item => item.price_source === 'company_history') : []);
  const blocking = proposals.some((proposal) => proposal.status !== "ready" || (proposal.missing_fields ?? []).length > 0);
  const changedSincePlan = transcript !== plannedTranscript || sourcesChanged;

  function pasteImages(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    const html = event.clipboardData.getData('text/html');
    if (!files.length && !html) return; // Normal plain-text paste retains the browser's caret behavior.
    event.preventDefault();
    try {
      const note = richNoteContent(html, event.clipboardData.getData('text/plain'), files);
      const input = event.currentTarget;
      const value = insertCopiedText(input.value, note.text, input.selectionStart, input.selectionEnd);
      if (input === copiedSourceInput.current) {
        copiedSourceRef.current = value; setCopiedSource(value); setSourcesChanged(true); sourceObservationsRef.current = '';
      } else updateTranscript(value);
      if (note.files.length) void addSources(note.files);
      setPasteHint(note.missingImages && !files.length ? 'Le texte est collé. Certaines photos ne sont pas transmises par cette application : joignez-les ou exportez la note complète en PDF.' : note.files.length ? 'Texte et fichiers ajoutés au même dossier.' : 'Texte de la note ajouté.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Collage impossible. Exportez la note complète en PDF.'); }
  }
  const clientSourceMode = Boolean(target && sourceRequestTarget(target, transcript) === "customer");
  const sourceControls = (
    (target === 'quote' || target === 'command' || target === 'customer') && <div className="ava-sources">
                  <strong>{clientSourceMode ? "Note ou photo → client" : "Photos et documents pour votre devis"}</strong>
                  {target === "customer" && <small>Depuis Apple Notes, copiez la note puis collez-la ci-dessous, ou joignez une capture/photo.</small>}
                  <div className="ava-source-buttons">
                    <button type="button" className="ava-secondary" disabled={busy} onClick={() => cameraInput.current?.click()}><Camera size={18} /> Prendre une photo</button>
                    <button type="button" className="ava-secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Paperclip size={18} /> Importer un dossier</button>
                  </div>
                  <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden aria-label={target === "customer" ? "Photo du client" : "Photo du chantier"} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addSources(files); }} />
                  <input ref={fileInput} type="file" accept="image/*,application/pdf,text/plain,text/html,.pdf,.txt,.html,.htm" multiple hidden aria-label={target === "customer" ? "Documents du client" : "Documents du devis"} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addSources(files); }} />
                  <small>Note complète en PDF, photos, TXT ou HTML · 12 photos/pages maximum. Vous pouvez sélectionner plusieurs fichiers.</small>
                  {sourcesBusy && <span role="status">Lecture des fichiers…</span>}
                  {sources.map((source, index) => <div className="ava-source" key={`${source.name}-${index}`}>
                    {source.image && <img src={source.image} alt="" />}
                    <span>{source.name}</span>
                    <button type="button" disabled={busy} aria-label={`Retirer ${source.name}`} onClick={() => { const next = sourcesRef.current.filter((_, position) => position !== index); sourcesRef.current = next; sourceObservationsRef.current = ''; setSources(next); setSourcesChanged(true); }}><X size={16} /></button>
                  </div>)}
                  <div className="ava-supplier-source">
                    <strong>Copier-coller une note avec son descriptif et ses photos</strong>
                    <button type="button" className="ava-secondary" disabled={busy || pasting} onClick={() => void pasteSource()}>Coller la note copiée</button>
                    <label>Texte copié<textarea ref={copiedSourceInput} onPaste={pasteImages} value={copiedSource} aria-label="Texte copié" placeholder="Collez ici le texte du mail, de la note ou du document…" maxLength={10_000} disabled={busy} onChange={event => { copiedSourceRef.current = event.target.value; setCopiedSource(event.target.value); setSourcesChanged(true); sourceObservationsRef.current = ''; setPasteHint(''); }} /></label>
                    {pasteHint && <small role="status">{pasteHint}</small>}
                    <small>Depuis Notes, importez la note exportée en PDF et les photos. Pour un PDF ou scan de plusieurs pages joint à la note, joignez aussi le document d’origine. Vous pouvez également coller le texte et joindre les photos dans ce même dossier. Vos consignes se précisent dans votre demande ci-dessous.</small>
                  </div>
                  {!clientSourceMode && <>
                    <label className="ava-supplier-markup">Majoration sur les prix HT (%)
                      <input type="text" inputMode="decimal" aria-label="Majoration sur les prix HT (%)" placeholder="Ex. 30" value={markupInput} disabled={busy} onChange={event => { markupInputRef.current = event.target.value; setMarkupInput(event.target.value); setSourcesChanged(true); }} />
                      <small>+30 % : 100 € HT devient 130 € HT. Vous pouvez aussi le dicter.</small>
                      <small>TVA de 10 % par défaut si aucun taux n’est indiqué. Les taux des sources ou de votre dictée sont conservés.</small>
                    </label>
                  </>}
                </div>
  );

  return (
    <>
      <button
        type="button"
        className="pc-ai-launcher ava-launcher"
        data-tour="ai-voice"
        aria-label="Ouvrir le mode IA"
        onClick={() => { reset("command"); setOpen(true); }}
      >
        <Sparkles size={17} />
        <span>Mode IA</span>
      </button>

      {open && (
        <div className={`ava-overlay ${stage === "requesting" || stage === "recording" || stage === "transcribing" || stage === "analysing" ? "ava-overlay-immersive" : ""}`} role="dialog" aria-modal="true" aria-label="Assistant vocal MANUFEO">
          {stage === "requesting" ? (
            <VoiceStartingVisualizer onClose={close} />
          ) : stage === "recording" ? (
            <VoiceListeningVisualizer
              level={voiceLevel}
              activity={voiceActivity}
              reactive={Boolean(pcmRef.current)}
              onFinish={() => void stopRecording()}
              onClose={close}
            />
          ) : stage === "transcribing" || stage === "analysing" || stage === "executing" ? (
            <VoiceProcessingVisualizer onClose={close} />
          ) : (
          <section className="ava-panel">
            <header className="ava-header">
              <div><small>MANUFEO IA</small><h2>Dictez ou joignez vos sources.</h2></div>
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

            {(stage === "ready" || stage === "error") && (
              <div className="ava-capture">
                <span className="ava-target">{choices.find((choice) => choice.id === target)?.label ?? "Demande"}</span>
                {!sourcesBusy && <VoicePreviewButton onStart={() => void startRecording()} append={Boolean(transcript.trim() || sources.length || copiedSource.trim())} disabled={busy} />}
                {sourceControls}
                <button type="button" className="ava-secondary" onClick={() => void showDrafts()}>Brouillons d’e-mails IA</button>
                <p>MANUFEO crée vos fiches et brouillons. Vous pouvez ensuite les modifier.</p>
                {target === "command" && <CommandPrecisionGuide />}
                <textarea
                  value={transcript}
                  onPaste={pasteImages}
                  onChange={(event) => updateTranscript(event.target.value)}
                  placeholder={customerImport ? "Collez ici votre note Apple Notes (nom, coordonnées, adresse…)" : placeholder(target)}
                  aria-label="Demande à MANUFEO"
                  disabled={busy}
                />
                {recordingUrl && <audio className="ava-recording" controls src={recordingUrl} aria-label="Réécouter la dictée" />}
                {message && <div className="ava-message" role="status">{message}</div>}
                {(stage === "ready" || stage === "error") && (transcript.trim() || sources.length > 0 || copiedSource.trim()) && (
                  <button type="button" className="ava-primary" disabled={busy} onClick={() => void prepare(transcriptRef.current)}>{clientSourceMode && (sources.length > 0 || copiedSource.trim() || customerImport) ? 'Lire et préparer le client' : sources.length || copiedSource.trim() ? 'Préparer le devis avec mes sources' : 'Créer avec MANUFEO'}</button>
                )}
                {(stage === "ready" || stage === "error") && target !== "command" && (
                  <button type="button" className="ava-secondary" onClick={() => { targetRef.current = null; setTarget(null); setStage("choose"); setMessage(""); }}>Changer de type</button>
                )}
              </div>
            )}

            {stage === "drafts" && <div className="ava-drafts">
              <strong>Brouillons d’e-mails IA</strong>
              <p>Relisez le message avant de l’envoyer depuis MANUFEO.</p>
              {emailConfirmation && <div className="ava-confirmation" role="status">{emailConfirmation}</div>}
              {message && <div className="ava-message" role="status">{message}</div>}
              {!message && drafts.length === 0 && <p>Aucun brouillon d’e-mail pour le moment.</p>}
              {drafts.map((draft) => <button type="button" key={draft.id} className={selectedDraftId === draft.id ? "selected" : ""} onClick={() => setSelectedDraftId(draft.id)}>
                <strong>{draft.subject}</strong><small>À : {draft.to} · {deliveries[draft.id]?.status === "sent" ? `Envoyé le ${new Date(deliveries[draft.id].sent_at!).toLocaleDateString("fr-FR")}` : deliveries[draft.id] ? "Envoi à vérifier" : `Brouillon du ${new Date(draft.createdAt).toLocaleDateString("fr-FR")}`}</small>
              </button>)}
              {drafts.filter((draft) => draft.id === selectedDraftId).map((draft) => <div className="ava-draft-detail" key={draft.id}>
                <div><strong>Destinataire</strong><span>{deliveries[draft.id]?.recipient ?? draft.to}</span></div>
                <div><strong>Objet</strong><span>{deliveries[draft.id]?.subject ?? draft.subject}</span></div>
                <div><strong>Message</strong><p>{deliveries[draft.id]?.body ?? draft.body}</p></div>
                {deliveries[draft.id]?.attachment_filename && <div><strong>Pièce jointe</strong><span>{deliveries[draft.id].attachment_filename}</span></div>}
                {deliveries[draft.id]?.status === "sent" ? <div className="ava-confirmation">E-mail envoyé depuis MANUFEO.</div> : <button type="button" className="ava-primary" onClick={() => void reviewDraft(draft)}>{deliveries[draft.id] ? "Vérifier l’envoi" : "Relire et envoyer"}</button>}
              </div>)}
              <button type="button" className="ava-secondary" onClick={close}>Fermer</button>
            </div>}

            {stage === "send" && emailReview && <div className="ava-drafts">
              <strong>Vérifier l’e-mail avant envoi</strong>
              <p>L’envoi partira depuis MANUFEO après votre appui sur « Envoyer l’e-mail ». Si le message désigne clairement un devis unique, MANUFEO le présélectionne mais vous gardez toujours le choix.</p>
              {message && <div className="ava-message" role="alert">{message}</div>}
              <div className="ava-draft-detail ava-send-form">
                <label>Destinataire<input type="email" value={emailReview.recipient} readOnly /></label>
                <label>Objet<input value={emailReview.subject} onChange={(event) => setEmailReview({ ...emailReview, subject: event.target.value })} disabled={emailBusy || Boolean(deliveries[emailReview.id])} /></label>
                <label>Message<textarea value={emailReview.body} onChange={(event) => setEmailReview({ ...emailReview, body: event.target.value })} disabled={emailBusy || Boolean(deliveries[emailReview.id])} /></label>
                {deliveries[emailReview.id] ? (
                  <div className="ava-attachment-locked"><strong>Pièce jointe</strong><span>{deliveries[emailReview.id].attachment_filename ?? "Aucune pièce jointe"}</span></div>
                ) : (
                  <label>Pièce jointe
                    <select
                      value={emailReview.quoteId ?? ""}
                      onChange={(event) => setEmailReview({ ...emailReview, quoteId: event.target.value || null })}
                      disabled={emailBusy || emailQuotesBusy}
                    >
                      <option value="">{emailQuotesBusy ? "Chargement des devis…" : "Sans pièce jointe"}</option>
                      {emailQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} — {quote.title}</option>)}
                    </select>
                    {emailSuggestedQuoteId && emailReview.quoteId === emailSuggestedQuoteId && <small>Devis de cette dictée reconnu et présélectionné. Vérifiez-le avant l’envoi.</small>}
                    {!emailQuotesBusy && !emailQuotes.length && <small>Aucun devis correspondant à ce destinataire n’est disponible.</small>}
                  </label>
                )}
                {deliveries[emailReview.id] && <small>Une tentative existe déjà : le contenu et la pièce jointe sont verrouillés pour éviter un double envoi.</small>}
                <button type="button" className="ava-primary" onClick={() => void sendReviewedEmail()} disabled={emailBusy || !emailReview.subject.trim() || !emailReview.body.trim()}>{emailBusy ? <><Loader2 size={17} className="ava-spin" /> Envoi en cours…</> : "Envoyer l’e-mail"}</button>
              </div>
              <button type="button" className="ava-secondary" disabled={emailBusy} onClick={() => { setStage("drafts"); setMessage(""); }}>Retour aux brouillons</button>
            </div>}

            {stage === "review" && (
              <div className="ava-review">
                <div className="ava-review-mascot"><ManufeoMascot mood={busy ? "writing" : "ready"} /><span>{busy ? "J’enregistre les actions validées…" : learnedPrices.length ? "Psst… j’ai retrouvé tes tarifs pour compléter ce devis 💡" : "Vérifiez les actions avant de les valider."}</span></div>
                {learnedPrices.length > 0 && <div className="ava-confirmation" role="status"><strong>{learnedPrices.length} tarif(s) proposé(s) depuis tes devis validés</strong>{learnedPrices.slice(0, 3).map((item, index) => <p key={index}>{String(item.label)} : {euro(item.unit_price)} HT/{String(item.unit)}</p>)}<small>Confirme ces prix avant de valider les actions, ou corrige ta demande.</small></div>}
                <div className="ava-review-head"><Check size={20} /><div><strong>{proposals.length ? `${proposals.length} action${proposals.length > 1 ? "s" : ""} préparée${proposals.length > 1 ? "s" : ""}` : "Dictée à vérifier"}</strong><small>{proposals.length ? "Vérifiez tout avant de valider." : "Réécoutez puis corrigez les passages incertains."}</small></div></div>
                {blocking && <div className="ava-blocking" role="alert"><strong>Une ou plusieurs actions ont besoin d’une correction.</strong><span>Les champs concernés sont indiqués en rouge ci-dessous. Corrigez la demande ici, puis relancez l’analyse.</span></div>}
                <details className="ava-transcript" open={!proposals.length}><summary>Transcription utilisée</summary><p>{transcript}</p>{recordingUrl && <audio controls src={recordingUrl} aria-label="Réécouter la dictée" />}</details>
                {(sources.length > 0 || copiedSource.trim()) && <details className="ava-transcript"><summary>Informations lues dans les sources</summary><p>{[copiedSource,sourceObservationsRef.current].filter(Boolean).join('\n\n')}</p></details>}
                <div className="ava-action-list">
                  {proposals.map((proposal, index) => (
                    <article key={proposal.id} className={proposal.status === "needs_input" ? "blocked" : ""}>
                      <div className="ava-action-number">{index + 1}</div>
                      <div className="ava-action-main">
                        <div className="ava-action-title"><strong>{intentLabels[proposal.intent_type] ?? proposal.intent_type}</strong><span className={`risk-${proposal.risk_level}`}>{riskLabel(proposal.risk_level)}</span></div>
                        <p>{proposalSummary(proposal)}</p>
                        {(proposal.warnings ?? []).map((warning) => <small className="ava-warning" key={warning}>⚠ {warning}</small>)}
                        {(proposal.missing_fields ?? []).map((field) => <small className="ava-missing" key={field}>À corriger : {missingLabel(field)}</small>)}
                        {(proposal.missing_fields ?? []).filter((field) => field.startsWith("collaborateur_introuvable: ")).map((field) => {
                          const name = field.slice("collaborateur_introuvable: ".length).trim();
                          return <button key={field} type="button" className="ava-secondary" disabled={busy} onClick={() => void prepare(`Crée ${name} comme collaborateur, puis ${transcript}`)}>
                            Créer {name} et reprendre
                          </button>;
                        })}
                      </div>
                    </article>
                  ))}
                </div>
                {message && <div className="ava-message" role="status">{message}</div>}
                {sensitive && (
                  <label className="ava-explicit">
                    <input type="checkbox" checked={explicitConfirmed} onChange={(event) => setExplicitConfirmed(event.target.checked)} disabled={busy} />
                    <span><strong>Je confirme les actions sensibles</strong><small>Paiement, facture, commande ou autre opération signalée. MANUFEO n’envoie jamais un document ou un e-mail sans étape dédiée.</small></span>
                  </label>
                )}
                {(blocking || editing) && <div className="ava-review-edit"><VoicePreviewButton append onStart={() => void startRecording()} disabled={busy} />{sourceControls}<label htmlFor="ava-correction">Corriger la dictée</label><textarea id="ava-correction" onPaste={pasteImages} value={transcript} onChange={(event) => updateTranscript(event.target.value)} disabled={busy} />{changedSincePlan && <small>Demande modifiée : relancez l’analyse pour mettre à jour les actions.</small>}<button type="button" className="ava-secondary" disabled={busy || (!transcript.trim() && !sources.length && !copiedSource.trim())} onClick={() => void prepare(transcriptRef.current)}>Relancer l’analyse</button></div>}
                <button type="button" className="ava-primary" disabled={!proposals.length || blocking || changedSincePlan || busy || (sensitive && !explicitConfirmed)} onClick={() => void execute()}>
                  {busy ? <><Loader2 size={17} className="ava-spin" /> Exécution sécurisée…</> : "Valider et exécuter"}
                </button>
                {!blocking && !editing && <button type="button" className="ava-secondary" disabled={busy} onClick={() => setEditing(true)}>Corriger la demande</button>}
              </div>
            )}

            {stage === "success" && (
              <div className="ava-success">
                <ManufeoMascot mood="ready" />
                <h3>Terminé.</h3>
                <p>MANUFEO a exécuté uniquement ce que vous avez validé.</p>
                <div>{results.map((result) => <span key={result.proposalId}><Check size={15} /> {result.message}</span>)}</div>
                {results.some((result) => result.intentType === "schedule_task") && <button type="button" className="ava-secondary" onClick={showCreatedAgenda}>Voir dans l’agenda</button>}
                {results.some((result) => result.intentType === "prepare_email") && <button type="button" className="ava-secondary" onClick={() => void showDrafts(results.find((result) => result.intentType === "prepare_email")?.proposalId)}>Voir le brouillon d’e-mail</button>}
                <button type="button" className="ava-primary" onClick={close}>Voir les changements</button>
              </div>
            )}
          </section>
          )}
        </div>
      )}
    </>
  );
}
