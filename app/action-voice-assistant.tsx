"use client";
import { canCreateDirectly } from "@/lib/voice-direct-creation";

import ManufeoMascot from "./manufeo-mascot";

import { FIELD_INTERFACE_QUERY } from "@/lib/responsive-interface";

import {
  CalendarDays,
  Check,
  FileText,
  Loader2,
  Mail,
  Mic,
  ReceiptText,
  ShoppingCart,
  Sparkles,
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
    return [name, clean(payload.siret) ? `SIRET ${clean(payload.siret)}` : "", emails[0] || "", phones[0] || ""].filter(Boolean).join(" · ");
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
      const quantity = row.quantity === null || row.quantity === undefined ? "qté ?" : `${quantityLabel(row.quantity)}${clean(row.unit) ? ` ${clean(row.unit)}` : ""}`;
      const price = row.unit_price === null || row.unit_price === undefined
        ? row.spoken_price_ttc !== null && row.spoken_price_ttc !== undefined ? `${euro(row.spoken_price_ttc)} TTC · TVA à préciser`
          : row.spoken_price_ambiguous !== null && row.spoken_price_ambiguous !== undefined ? `${euro(row.spoken_price_ambiguous)} · HT/TTC à préciser`
            : "prix ?"
        : `${euro(row.unit_price)} ${row.price_type === "unknown" ? "(HT supposé)" : "HT"}`;
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
  if (target === "supplier") return "Ex. Crée le fournisseur Tollens, contact Julie, e-mail julie arobase tollens point fr, téléphone 04…, adresse…";
  if (target === "customer") return "Ex. Société Martin Peinture, SIRET…, téléphone…, adresse…";
  if (target === "agenda") return "Ex. Mets une visite mardi prochain à 14 h chez Dupont.";
  return "Ex. Client Dupont, peinture 18 m² à 32 € HT, TVA 10 %.";
}

async function parseSingleTarget(target: Exclude<VoiceActionTarget, "command">, transcript: string, signal: AbortSignal) {
  const agenda = target === "agenda";
  const response = await fetch(agenda ? "/api/ai/agenda" : "/api/ai/parse", {
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
    setPlannedTranscript("");
    setEditing(false);
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
      if (!element?.closest(".rm-create-ai, .rm-voice-button, .rm-ai-create-text")) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      reset("command");
      setOpen(true);
      void startRecording();
    };
    const custom = (event: Event) => {
      const detail = (event as CustomEvent<{ target?: VoiceActionTarget; startListening?: boolean }>).detail;
      const preset = detail?.target ?? "command";
      reset(preset);
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
    if (!selected || !text.trim()) {
      setMessage("Dictez ou écrivez d’abord votre demande.");
      setStage("ready");
      return;
    }
    const normalized = normalizeVoiceTranscript(text);
    updateTranscript(normalized);
    if (isStandaloneTradeAnalysis(normalized)) {
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
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const organizationId = await getActiveOrganizationId();
      const parsed = selected === "command" || selected === "supplier" ? undefined : await parseSingleTarget(selected, normalized, controller.signal);
      const planned = await planVoiceActions({
        organizationId,
        transcript: normalized,
        target: selected,
        parsed,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!planned.proposals.length) throw new Error("Aucune action exploitable n’a été reconnue.");
      setProposals(planned.proposals);
      setPlannedTranscript(normalized);
      setEditing(false);
      if (planned.proposals.every(canCreateDirectly)) {
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
      if (text) updateTranscript(text);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setVoiceLevel(0);
      setMessage(event.error ? `Micro interrompu : ${event.error}` : "Micro interrompu.");
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
    setMessage("");
    setVoiceLevel(0);
    setVoiceActivity(0);
    previousVoiceLevelRef.current = 0;
    updateTranscript("");
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
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Transcription impossible.");
      const text = clean(result.text);
      if (!text) throw new Error("Aucun texte reconnu.");
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
    if (transcript !== plannedTranscript) {
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

  const busy = ["requesting", "transcribing", "analysing", "executing"].includes(stage);
  const sensitive = proposals.some((proposal) => proposal.risk_level === "explicit_confirmation");
  const learnedPrices = proposals.filter(proposal => proposal.intent_type === 'prepare_quote').flatMap(proposal =>
    Array.isArray(proposal.payload?.items) ? (proposal.payload.items as Array<Record<string, unknown>>).filter(item => item.price_source === 'company_history') : []);
  const blocking = proposals.some((proposal) => proposal.status !== "ready" || (proposal.missing_fields ?? []).length > 0);
  const changedSincePlan = transcript !== plannedTranscript;

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

            {(stage === "ready" || stage === "error") && (
              <div className="ava-capture">
                <span className="ava-target">{choices.find((choice) => choice.id === target)?.label ?? "Demande"}</span>
                <VoicePreviewButton onStart={() => void startRecording()} />
                <button type="button" className="ava-secondary" onClick={() => void showDrafts()}>Brouillons d’e-mails IA</button>
                <p>MANUFEO crée vos fiches et brouillons. Vous pouvez ensuite les modifier.</p>
                {target === "command" && <CommandPrecisionGuide />}
                <textarea
                  value={transcript}
                  onChange={(event) => updateTranscript(event.target.value)}
                  placeholder={placeholder(target)}
                  aria-label="Demande à MANUFEO"
                  disabled={busy}
                />
                {recordingUrl && <audio className="ava-recording" controls src={recordingUrl} aria-label="Réécouter la dictée" />}
                {message && <div className="ava-message" role="status">{message}</div>}
                {(stage === "ready" || stage === "error") && transcript.trim() && (
                  <button type="button" className="ava-primary" onClick={() => void prepare(transcriptRef.current)}>Créer avec MANUFEO</button>
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
                {(blocking || editing) && <div className="ava-review-edit"><label htmlFor="ava-correction">Corriger la dictée</label><textarea id="ava-correction" value={transcript} onChange={(event) => updateTranscript(event.target.value)} disabled={busy} />{changedSincePlan && <small>Demande modifiée : relancez l’analyse pour mettre à jour les actions.</small>}<button type="button" className="ava-secondary" disabled={busy || !transcript.trim()} onClick={() => void prepare(transcriptRef.current)}>Relancer l’analyse</button></div>}
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
