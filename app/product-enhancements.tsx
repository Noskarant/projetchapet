"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileSignature, FileText, Loader2, LogIn, LogOut, Mail, Mic, ReceiptText, Send, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  customerName,
  fetchWorkspace,
  saveEInvoicePreparation,
  saveQuoteSignature,
  type Invoice,
  type Quote,
} from "@/lib/project-chapet";
import { blobToBase64, buildDocumentPdf, downloadDocumentPdf, shareDocumentPdf } from "@/lib/document-tools";

type Panel = "documents" | "account" | "voice" | null;
type BusinessDocument = Quote | Invoice;
type RecognitionResultEvent = { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> };
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

function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor });
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function startBrowserDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    onError("La dictée directe n’est pas disponible sur ce navigateur. Chrome ou Edge sont recommandés.");
    return null;
  }
  const recognition = new Constructor();
  recognition.lang = "fr-FR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
    if (text) onText(text);
  };
  recognition.onerror = (event) => onError(event.error ? `Dictée interrompue : ${event.error}` : "Dictée interrompue.");
  recognition.start();
  return recognition;
}

function useFormVoiceEnhancer(setMessage: (message: string) => void) {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLLabelElement>(".pc-crud-modal label").forEach((label) => {
        const control = label.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type='date']):not([type='number']), textarea");
        if (!control || label.dataset.voiceEnhanced === "true") return;
        label.dataset.voiceEnhanced = "true";
        label.classList.add("pc-voice-label");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pc-inline-mic";
        button.title = "Dicter ce champ";
        button.setAttribute("aria-label", "Dicter ce champ");
        button.textContent = "🎙";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          button.classList.add("listening");
          startBrowserDictation(
            (text) => {
              const prefix = control.value.trim();
              setNativeValue(control, prefix ? `${prefix} ${text}` : text);
              button.classList.remove("listening");
            },
            (message) => {
              button.classList.remove("listening");
              setMessage(message);
            },
          );
        });
        label.appendChild(button);
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [setMessage]);
}

function AccountPanel({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSessionEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function login() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return notify(error.message);
    notify("Connexion réussie. Votre espace privé est chargé.");
    setTimeout(() => window.location.reload(), 400);
  }

  async function signup() {
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { company_name: "Mon entreprise" } } });
    setBusy(false);
    if (error) return notify(error.message);
    notify("Compte créé. Consultez votre e-mail si une confirmation est demandée.");
  }

  async function logout() {
    await supabase.auth.signOut();
    notify("Déconnecté : retour au mode démonstration.");
    setTimeout(() => window.location.reload(), 300);
  }

  return (
    <aside className="pc-enhancement-panel">
      <header><div><span>Accès sécurisé</span><h2>Compte entreprise</h2></div><button onClick={onClose}><X size={19} /></button></header>
      {sessionEmail ? (
        <div className="pc-account-state">
          <ShieldCheck size={34} />
          <h3>Espace privé actif</h3>
          <p>{sessionEmail}</p>
          <p>Les clients, devis et factures sont isolés dans votre organisation Supabase.</p>
          <button className="pc-secondary" onClick={logout}><LogOut size={16} /> Se déconnecter</button>
        </div>
      ) : (
        <div className="pc-enhancement-form">
          <div className="pc-demo-note"><ShieldCheck size={18} /><span>Le site est actuellement en mode démonstration partagé. Connectez-vous pour ouvrir un espace privé.</span></div>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Mot de passe<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="pc-primary" onClick={login} disabled={busy || !email || password.length < 8}>{busy ? <Loader2 className="pc-spin" size={16} /> : <LogIn size={16} />} Se connecter</button>
          <button className="pc-secondary" onClick={signup} disabled={busy || !email || password.length < 8}>Créer mon espace privé</button>
        </div>
      )}
    </aside>
  );
}

function SignaturePad({ quote, onClose, onSaved, notify }: { quote: Quote; onClose: () => void; onSaved: () => Promise<void>; notify: (message: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [name, setName] = useState(quote.signer_name ?? customerName(quote.customer));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) { context.lineWidth = 2; context.lineCap = "round"; context.strokeStyle = "#102a43"; }
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const context = event.currentTarget.getContext("2d");
    const p = point(event);
    context?.beginPath();
    context?.moveTo(p.x, p.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = point(event);
    const context = event.currentTarget.getContext("2d");
    context?.lineTo(p.x, p.y);
    context?.stroke();
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !name.trim()) return notify("Indiquez le nom du signataire.");
    setBusy(true);
    try {
      await saveQuoteSignature(quote.id, name.trim(), canvas.toDataURL("image/png"));
      await onSaved();
      notify("Signature enregistrée et devis accepté.");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Signature impossible.");
    } finally { setBusy(false); }
  }

  return (
    <div className="pc-enhancement-overlay">
      <section className="pc-signature-modal">
        <header><div><span>Acceptation client</span><h2>Signer {quote.number}</h2></div><button onClick={onClose}><X size={19} /></button></header>
        <label>Nom du signataire<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <p>Signez dans la zone ci-dessous avec le doigt, la souris ou un stylet.</p>
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
        <footer><button className="pc-secondary" onClick={clear}>Effacer</button><button className="pc-primary" onClick={save} disabled={busy}>{busy && <Loader2 size={16} className="pc-spin" />} Enregistrer la signature</button></footer>
        <small>Cette capture constitue une preuve d’acceptation simple, pas une signature électronique qualifiée eIDAS.</small>
      </section>
    </div>
  );
}

function DocumentsPanel({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [type, setType] = useState<"quote" | "invoice">("quote");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<Quote | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWorkspace();
      setQuotes(data.quotes);
      setInvoices(data.invoices);
      setSelectedId((current) => current || data.quotes[0]?.id || data.invoices[0]?.id || "");
    } catch (error) { notify(error instanceof Error ? error.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const list = type === "quote" ? quotes : invoices;
    if (!list.some((item) => item.id === selectedId)) setSelectedId(list[0]?.id ?? "");
  }, [type, quotes, invoices, selectedId]);

  const selected = useMemo<BusinessDocument | null>(() => {
    const list = type === "quote" ? quotes : invoices;
    return list.find((item) => item.id === selectedId) ?? null;
  }, [type, quotes, invoices, selectedId]);

  async function download() {
    if (!selected) return;
    setBusy(true);
    try { await downloadDocumentPdf(selected); notify(`${selected.number}.pdf téléchargé.`); }
    catch (error) { notify(error instanceof Error ? error.message : "PDF impossible."); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    try {
      const shared = await shareDocumentPdf(selected).catch(() => false);
      if (shared) { notify("Document partagé depuis l’appareil."); return; }
      const recipient = window.prompt("Adresse e-mail du destinataire", selected.customer.emails?.[0] ?? "")?.trim();
      if (!recipient) return;
      const blob = await buildDocumentPdf(selected);
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient,
          subject: `${type === "quote" ? "Votre devis" : "Votre facture"} ${selected.number}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>${type === "quote" ? "Votre devis" : "Votre facture"}</h2><p>Bonjour,</p><p>Veuillez trouver le document <strong>${selected.number}</strong> en pièce jointe.</p><p>Cordialement,<br>CHAPET SAS</p></div>`,
          attachments: [{ filename: `${selected.number}.pdf`, content: await blobToBase64(blob) }],
        }),
      });
      if (!response.ok) {
        await downloadDocumentPdf(selected);
        window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(selected.number)}&body=${encodeURIComponent("Bonjour,\n\nVeuillez trouver le document téléchargé à joindre à ce message.\n\nCordialement")}`;
        notify("Resend n’est pas encore configuré : le PDF est téléchargé et votre messagerie est ouverte.");
        return;
      }
      notify(`Document envoyé à ${recipient}.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Envoi impossible."); }
    finally { setBusy(false); }
  }

  async function prepareEInvoice() {
    if (!selected || type !== "invoice") return;
    setBusy(true);
    try {
      const invoice = selected as Invoice;
      const response = await fetch("/api/einvoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice, company: { name: "CHAPET SAS", siret: "89244511200018", vat_number: "FR32892445112" }, operation_category: "service" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Préparation impossible.");
      await saveEInvoicePreparation(invoice.id, data.payload);
      const blob = new Blob([JSON.stringify(data.payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.number}-e-facture-draft.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      await reload();
      notify(data.ready ? "Dossier e-facture prêt pour le raccordement à une plateforme agréée." : `Dossier préparé avec ${data.warnings.length} point(s) à compléter.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Préparation impossible."); }
    finally { setBusy(false); }
  }

  const list = type === "quote" ? quotes : invoices;
  return (
    <>
      <aside className="pc-enhancement-panel pc-documents-panel">
        <header><div><span>PDF, envoi et conformité</span><h2>Outils documents</h2></div><button onClick={onClose}><X size={19} /></button></header>
        <div className="pc-segmented pc-enhancement-tabs"><button className={type === "quote" ? "active" : ""} onClick={() => setType("quote")}><FileText size={15} /> Devis</button><button className={type === "invoice" ? "active" : ""} onClick={() => setType("invoice")}><ReceiptText size={15} /> Factures</button></div>
        {loading ? <div className="pc-enhancement-loading"><Loader2 className="pc-spin" /> Chargement…</div> : list.length ? (
          <>
            <label>Document<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{list.map((item) => <option key={item.id} value={item.id}>{item.number} · {customerName(item.customer)}</option>)}</select></label>
            {selected && <div className="pc-selected-document"><strong>{selected.number}</strong><span>{customerName(selected.customer)}</span><b>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(selected.total))}</b></div>}
            <div className="pc-document-actions">
              <button className="pc-primary" onClick={download} disabled={busy}><Download size={16} /> Télécharger le PDF</button>
              <button className="pc-secondary" onClick={send} disabled={busy}><Send size={16} /> Envoyer / partager</button>
              {type === "quote" && selected && <button className="pc-secondary" onClick={() => setSigning(selected as Quote)}><FileSignature size={16} /> Faire signer</button>}
              {type === "invoice" && <button className="pc-secondary" onClick={prepareEInvoice} disabled={busy}><ShieldCheck size={16} /> Préparer l’e-facture</button>}
            </div>
            <div className="pc-workflow-note">
              {type === "invoice" ? "Le module prépare les données réglementaires. La transmission réelle nécessitera l’API d’une plateforme agréée." : "Le PDF inclut automatiquement la signature lorsque le devis a été signé."}
            </div>
          </>
        ) : <p>Aucun document disponible.</p>}
      </aside>
      {signing && <SignaturePad quote={signing} onClose={() => setSigning(null)} onSaved={reload} notify={notify} />}
    </>
  );
}

function fillControlByLabel(container: Element, labelText: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  const label = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.toLowerCase().includes(labelText.toLowerCase()));
  const control = label?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  if (control) setNativeValue(control, String(value));
}

async function fillCurrentForm(data: Record<string, any>, kind: "customer" | "document") {
  const modal = document.querySelector(".pc-crud-modal");
  if (!modal) throw new Error("Ouvrez d’abord un formulaire client, devis ou facture.");
  if (kind === "customer") {
    const targetKind = data.kind === "individual" ? "Particulier" : "Professionnel";
    const kindButton = Array.from(modal.querySelectorAll<HTMLButtonElement>(".pc-segmented button")).find((button) => button.textContent?.includes(targetKind));
    kindButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fillControlByLabel(modal, "Raison sociale", data.company_name);
    fillControlByLabel(modal, "Civilité", data.civility);
    fillControlByLabel(modal, "Nom", data.last_name);
    fillControlByLabel(modal, "Prénom", data.first_name);
    fillControlByLabel(modal, "SIRET", data.siret);
    fillControlByLabel(modal, "TVA intracommunautaire", data.vat_number);
    fillControlByLabel(modal, "E-mail principal", data.email1);
    fillControlByLabel(modal, "Second e-mail", data.email2);
    fillControlByLabel(modal, "Téléphone principal", data.phone1);
    fillControlByLabel(modal, "Second téléphone", data.phone2);
    fillControlByLabel(modal, "Adresse", data.line1);
    fillControlByLabel(modal, "Code postal", data.postal_code);
    fillControlByLabel(modal, "Ville", data.city);
    fillControlByLabel(modal, "Notes", data.notes);
    return;
  }

  fillControlByLabel(modal, "Objet du devis", data.title);
  fillControlByLabel(modal, "Notes", data.notes);
  if (data.customer_hint) {
    const clientSelect = Array.from(modal.querySelectorAll<HTMLLabelElement>("label")).find((label) => label.textContent?.trim().startsWith("Client"))?.querySelector("select");
    const option = clientSelect ? Array.from(clientSelect.options).find((item) => item.text.toLowerCase().includes(String(data.customer_hint).toLowerCase())) : null;
    if (clientSelect && option) setNativeValue(clientSelect, option.value);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const addButton = Array.from(modal.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Ajouter une ligne"));
  while (modal.querySelectorAll(".pc-item-editor").length < items.length) {
    addButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  Array.from(modal.querySelectorAll<HTMLElement>(".pc-item-editor")).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    fillControlByLabel(row, "Désignation", item.label);
    fillControlByLabel(row, "Qté", item.quantity);
    fillControlByLabel(row, "Unité", item.unit);
    fillControlByLabel(row, "Prix unitaire", item.unit_price);
    fillControlByLabel(row, "TVA", item.tax_rate);
  });
}

function VoiceAssistantPanel({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const modalTitle = typeof document !== "undefined" ? document.querySelector(".pc-crud-modal h2")?.textContent ?? "" : "";
  const kind: "customer" | "document" = /client/i.test(modalTitle) ? "customer" : "document";

  function listen() {
    setListening(true);
    startBrowserDictation(
      (text) => { setTranscript((current) => current ? `${current} ${text}` : text); setListening(false); },
      (message) => { notify(message); setListening(false); },
    );
  }

  async function analyse() {
    if (!transcript.trim()) return notify("Dictez ou écrivez les informations à analyser.");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, transcript }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analyse impossible.");
      await fillCurrentForm(result.data, kind);
      const warnings = Array.isArray(result.data?.warnings) ? result.data.warnings.filter(Boolean) : [];
      notify(`${result.provider === "local-fallback" ? "Préremplissage local" : "Préremplissage IA"} terminé${warnings.length ? ` · ${warnings.length} élément(s) à vérifier` : ""}.`);
      onClose();
    } catch (error) { notify(error instanceof Error ? error.message : "Analyse impossible."); }
    finally { setBusy(false); }
  }

  return (
    <aside className="pc-enhancement-panel pc-voice-assistant-panel">
      <header><div><span>Saisie structurée</span><h2>Remplir ce formulaire à la voix</h2></div><button onClick={onClose}><X size={19} /></button></header>
      <div className="pc-ai-explainer"><Sparkles size={18} /><span>{kind === "customer" ? "Dictez le nom, le type de client, les coordonnées, le SIRET et l’adresse." : "Dictez le client, l’objet, chaque prestation, la quantité, l’unité, le prix et la TVA."}</span></div>
      <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={kind === "customer" ? "Ex. Nouveau client professionnel, société Martin Peinture, SIRET…" : "Ex. Client Giraud, préparation de 85 m² à 12 euros, peinture deux couches…"} />
      <button className={`pc-voice-capture ${listening ? "listening" : ""}`} onClick={listen}><Mic size={19} /> {listening ? "Écoute en cours…" : "Dicter"}</button>
      <button className="pc-primary" onClick={analyse} disabled={busy || !transcript.trim()}>{busy ? <Loader2 className="pc-spin" size={16} /> : <Sparkles size={16} />} Analyser et préremplir</button>
      <small>Les valeurs restent modifiables et doivent être contrôlées avant validation. Aucun document n’est envoyé automatiquement.</small>
    </aside>
  );
}

export default function ProductEnhancements() {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const notify = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 5200);
  }, []);

  useFormVoiceEnhancer(notify);

  useEffect(() => {
    const check = () => setFormOpen(Boolean(document.querySelector(".pc-crud-modal form")));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="pc-enhancement-launcher">
        {formOpen && <button className="pc-enhancement-voice" onClick={() => setPanel("voice")}><Mic size={16} /><span>Remplir à la voix</span></button>}
        <button onClick={() => setPanel("documents")}><FileText size={17} /><span>PDF & envoi</span></button>
        <button onClick={() => setPanel("account")}><UserRound size={17} /><span>Compte</span></button>
      </div>
      {panel && <button className="pc-enhancement-backdrop" onClick={() => setPanel(null)} aria-label="Fermer" />}
      {panel === "documents" && <DocumentsPanel onClose={() => setPanel(null)} notify={notify} />}
      {panel === "account" && <AccountPanel onClose={() => setPanel(null)} notify={notify} />}
      {panel === "voice" && <VoiceAssistantPanel onClose={() => setPanel(null)} notify={notify} />}
      {message && <div className="pc-enhancement-toast"><Check size={17} />{message}</div>}
    </>
  );
}
