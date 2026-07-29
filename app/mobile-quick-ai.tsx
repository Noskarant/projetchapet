"use client";

import { Check, FileText, Loader2, Mic, ReceiptText, Square, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Target = "quote" | "invoice" | "customer";
type Parsed = Record<string, any>;

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function controlByLabel(container: Element, text: string) {
  const label = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.toLowerCase().includes(text.toLowerCase()));
  return label?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select") ?? null;
}

function fill(container: Element, label: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  const control = controlByLabel(container, label);
  if (control) setNativeValue(control, String(value));
}

async function waitForModal() {
  const start = Date.now();
  while (Date.now() - start < 2500) {
    const modal = document.querySelector<HTMLElement>(".pc-crud-modal");
    if (modal) return modal;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error("Le formulaire n’a pas pu être ouvert.");
}

function findButton(text: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.toLowerCase().includes(text.toLowerCase()));
}

async function openForm(target: Target) {
  const nav = target === "customer" ? "Clients" : target === "quote" ? "Devis" : "Factures";
  Array.from(document.querySelectorAll<HTMLButtonElement>(".pc-mobile-nav button,.pc-sidebar nav button")).find((button) => button.textContent?.includes(nav))?.click();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const action = target === "customer" ? "Nouveau client" : target === "quote" ? "Nouveau devis" : "Nouvelle facture";
  const button = findButton(action);
  if (!button) throw new Error(`Le bouton « ${action} » est introuvable.`);
  button.click();
  return waitForModal();
}

async function applyParsed(target: Target, data: Parsed) {
  const modal = await openForm(target);
  if (target === "customer") {
    const desired = data.kind === "individual" ? "Particulier" : "Professionnel";
    Array.from(modal.querySelectorAll<HTMLButtonElement>(".pc-segmented button")).find((button) => button.textContent?.includes(desired))?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    fill(modal, "Raison sociale", data.company_name);
    fill(modal, "Civilité", data.civility);
    fill(modal, "Nom", data.last_name);
    fill(modal, "Prénom", data.first_name);
    fill(modal, "SIRET", data.siret);
    fill(modal, "TVA intracommunautaire", data.vat_number);
    fill(modal, "E-mail principal", data.email1);
    fill(modal, "Second e-mail", data.email2);
    fill(modal, "Téléphone principal", data.phone1);
    fill(modal, "Second téléphone", data.phone2);
    fill(modal, "Adresse", data.line1);
    fill(modal, "Code postal", data.postal_code);
    fill(modal, "Ville", data.city);
    fill(modal, "Notes", data.notes);
    return;
  }

  if (target === "quote") fill(modal, "Objet du devis", data.title);
  fill(modal, "Notes", data.notes);
  if (data.customer_hint) {
    const select = controlByLabel(modal, "Client");
    if (select instanceof HTMLSelectElement) {
      const option = Array.from(select.options).find((item) => item.text.toLowerCase().includes(String(data.customer_hint).toLowerCase()));
      if (option) setNativeValue(select, option.value);
    }
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const add = findButton("Ajouter une ligne");
  while (modal.querySelectorAll(".pc-item-editor").length < items.length) {
    add?.click();
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  Array.from(modal.querySelectorAll<HTMLElement>(".pc-item-editor")).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    fill(row, "Désignation", item.label);
    fill(row, "Qté", item.quantity);
    fill(row, "Unité", item.unit);
    fill(row, "Prix unitaire", item.unit_price);
    fill(row, "TVA", item.tax_rate);
  });
}

export default function MobileQuickAi() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>("quote");
  const [stage, setStage] = useState<"idle" | "recording" | "working" | "review">("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function analyse(text: string) {
    setStage("working");
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: target === "customer" ? "customer" : "document", transcript: text, target }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analyse impossible.");
    setParsed(result.data);
    setStage("review");
  }

  async function start() {
    setError("");
    setParsed(null);
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          setStage("working");
          const form = new FormData();
          form.append("file", new File([blob], "dictee.webm", { type: blob.type }));
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Transcription impossible.");
          const text = String(result.text || "").trim();
          if (!text) throw new Error("Aucun texte reconnu.");
          setTranscript(text);
          await analyse(text);
        } catch (err) {
          setStage("idle");
          setError(err instanceof Error ? err.message : "Erreur de transcription.");
        }
      };
      recorder.start(200);
      setStage("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone inaccessible.");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function apply() {
    if (!parsed) return;
    try {
      setStage("working");
      await applyParsed(target, parsed);
      setOpen(false);
      setStage("idle");
    } catch (err) {
      setStage("review");
      setError(err instanceof Error ? err.message : "Préremplissage impossible.");
    }
  }

  return (
    <>
      <button className="pc-mobile-ai-fab" onClick={() => setOpen(true)} aria-label="Dicter avec l’IA"><Mic size={25} /></button>
      {open && <div className="pc-mobile-ai-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <section className="pc-mobile-ai-sheet" role="dialog" aria-modal="true">
          <header><div><span>SAISIE RAPIDE</span><h2>{stage === "recording" ? "Je vous écoute…" : stage === "working" ? "Je prépare le formulaire…" : stage === "review" ? "Vérifiez les informations" : "Que voulez-vous créer ?"}</h2></div><button onClick={() => setOpen(false)}><X size={21} /></button></header>

          {stage === "idle" && !parsed && (
            <>
              <div className="pc-mobile-ai-targets">
                <button className={target === "quote" ? "active" : ""} onClick={() => setTarget("quote")}><FileText size={19} /><span>Devis</span></button>
                <button className={target === "invoice" ? "active" : ""} onClick={() => setTarget("invoice")}><ReceiptText size={19} /><span>Facture</span></button>
                <button className={target === "customer" ? "active" : ""} onClick={() => setTarget("customer")}><UserRound size={19} /><span>Client</span></button>
              </div>
              <button className="pc-mobile-ai-mic" onClick={start}><Mic size={34} /><strong>Appuyer puis parler</strong><small>Client, chantier, prestations, quantités, prix et TVA</small></button>
            </>
          )}

          {stage === "recording" && (
            <button className="pc-mobile-ai-listening" onClick={stop}>
              <div className="pc-mobile-ai-wave">{Array.from({ length: 15 }).map((_, index) => <i key={index} />)}</div>
              <strong>Parlez naturellement</strong>
              <small>Appuyez pour terminer</small>
              <span><Square size={17} /> Terminer</span>
            </button>
          )}

          {stage === "working" && <div className="pc-mobile-ai-working"><Loader2 className="pc-spin" size={34} /><strong>Quelques secondes…</strong><small>Transcription et préparation automatique</small></div>}

          {stage === "review" && parsed && (
            <div className="pc-mobile-ai-review">
              {transcript && <details><summary>Ce que j’ai entendu</summary><p>{transcript}</p></details>}
              {target === "customer" ? (
                <div className="pc-mobile-ai-summary"><span><b>Client</b>{parsed.company_name || [parsed.first_name, parsed.last_name].filter(Boolean).join(" ") || "À compléter"}</span><span><b>Téléphone</b>{parsed.phone1 || "—"}</span><span><b>Adresse</b>{[parsed.line1, parsed.postal_code, parsed.city].filter(Boolean).join(", ") || "—"}</span></div>
              ) : (
                <div className="pc-mobile-ai-summary"><span><b>Client</b>{parsed.customer_hint || "À sélectionner"}</span><span><b>Objet</b>{parsed.title || "À compléter"}</span>{(parsed.items || []).map((item: any, index: number) => <span key={index}><b>{item.label || "Prestation"}</b>{item.quantity || 0} {item.unit || ""} · {item.unit_price || 0} € HT · TVA {item.tax_rate || 0} %</span>)}</div>
              )}
              <button className="pc-mobile-ai-apply" onClick={apply}><Check size={19} /> Préremplir maintenant</button>
              <button className="pc-mobile-ai-retry" onClick={() => { setParsed(null); setStage("idle"); }}>Recommencer</button>
            </div>
          )}

          {error && <p className="pc-mobile-ai-error">{error}</p>}
        </section>
      )}
    </>
  );
}
