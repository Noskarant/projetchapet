"use client";

import { Check, Lightbulb, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildDocumentEmailMessage, readCompanyProfile } from "@/lib/company-profile";
import { appendSuggestionsWithoutInventing, suggestRappidosExtras, type RappidosSuggestion } from "@/lib/rappidos-suggestions";

type ApplyDetail = {
  target?: string;
  data?: { items?: Array<{ label?: string; quantity?: number; unit?: string; unit_price?: number; tax_rate?: number }> };
};

type LookupCompany = { companyName: string; siret: string; vatNumber: string; address: string; postalCode: string; city: string };

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function setReactInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function fieldByLabel(root: ParentNode, labelText: string) {
  const labels = Array.from(root.querySelectorAll("label"));
  const label = labels.find((candidate) => candidate.textContent?.trim().toLowerCase().startsWith(labelText.toLowerCase()));
  return label?.querySelector<HTMLInputElement>("input") ?? null;
}

export default function RappidosExperienceBridge() {
  const [lastTranscript, setLastTranscript] = useState("");
  const [reviewHost, setReviewHost] = useState<HTMLElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const suggestions = useMemo(() => suggestRappidosExtras(lastTranscript), [lastTranscript]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.includes("/api/ai/parse") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as { transcript?: string };
          if (body.transcript) {
            setLastTranscript(body.transcript);
            setSelectedIds([]);
          }
        } catch {}
      }

      if (url.includes("/api/email") && (init?.method ?? "GET").toUpperCase() === "POST" && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const profile = readCompanyProfile(window.localStorage);
          const identity = profile.legalName ? `<div style="margin-top:18px;font-weight:700">${profile.legalName}</div>` : "";
          const logo = profile.logoDataUrl ? `<img src="${profile.logoDataUrl}" alt="Logo" style="display:block;max-width:150px;max-height:70px;margin:0 0 16px">` : "";
          const html = typeof body.html === "string" ? body.html.replaceAll("CHAPET SAS", profile.legalName || "Votre entreprise") : "";
          body.html = `${logo}${html}${identity}<div style="margin-top:22px;font-size:11px;color:#718096">Envoyé via l’application de gestion de l’artisan.</div>`;
          return originalFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {}
      }
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;
    return () => { if (window.fetch === wrappedFetch) window.fetch = originalFetch; };
  }, []);

  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<ApplyDetail>).detail;
      if (!detail?.data || (detail.target !== "quote" && detail.target !== "invoice")) return;
      const accepted = suggestions.filter((item) => selectedIds.includes(item.id));
      if (!accepted.length) return;
      detail.data.items = appendSuggestionsWithoutInventing(detail.data.items, accepted);
    };
    window.addEventListener("projetchapet:ai-apply", apply, { capture: true });
    return () => window.removeEventListener("projetchapet:ai-apply", apply, { capture: true });
  }, [selectedIds, suggestions]);

  useEffect(() => {
    const enhance = () => {
      const capture = document.querySelector<HTMLElement>(".mai-capture");
      const textarea = capture?.querySelector<HTMLTextAreaElement>("textarea[aria-label='Demande à analyser']") ?? null;
      if (capture && textarea && !capture.querySelector(".rap-keyboard-toggle")) {
        textarea.style.display = "none";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rap-keyboard-toggle mai-secondary";
        button.textContent = "Saisir ou corriger au clavier";
        button.addEventListener("click", () => {
          const hidden = textarea.style.display === "none";
          textarea.style.display = hidden ? "block" : "none";
          button.textContent = hidden ? "Masquer le texte" : "Saisir ou corriger au clavier";
          if (hidden) textarea.focus();
        });
        textarea.insertAdjacentElement("afterend", button);
      }
      if (capture) {
        const heading = capture.querySelector("h3")?.textContent ?? "";
        capture.classList.toggle("rap-processing", /Transcription|Préparation|Activation/i.test(heading));
      }

      const review = document.querySelector<HTMLElement>(".mai-review");
      setReviewHost((current) => current === review ? current : review);

      const customerEditor = Array.from(document.querySelectorAll<HTMLElement>(".rm-v2-editor"))
        .find((node) => /client/i.test(node.querySelector("h2")?.textContent ?? ""));
      if (customerEditor && !customerEditor.querySelector(".rap-siret-lookup")) {
        const siret = fieldByLabel(customerEditor, "SIRET");
        if (siret) {
          const lookup = document.createElement("button");
          lookup.type = "button";
          lookup.className = "rap-siret-lookup";
          lookup.innerHTML = "Rechercher l’entreprise";
          lookup.addEventListener("click", async () => {
            const digits = siret.value.replace(/\D/g, "");
            if (digits.length !== 14) { lookup.textContent = "SIRET : 14 chiffres requis"; return; }
            lookup.textContent = "Recherche…";
            lookup.setAttribute("disabled", "true");
            try {
              const response = await fetch(`/api/company-lookup?siret=${encodeURIComponent(digits)}`, { cache: "no-store" });
              const payload = await response.json() as { company?: LookupCompany; error?: string };
              if (!response.ok || !payload.company) throw new Error(payload.error || "Entreprise introuvable");
              const mappings: Array<[string, string]> = [
                ["Raison sociale", payload.company.companyName], ["SIRET", payload.company.siret], ["TVA", payload.company.vatNumber],
                ["Adresse", payload.company.address], ["Code postal", payload.company.postalCode], ["Ville", payload.company.city],
              ];
              for (const [label, value] of mappings) {
                const field = fieldByLabel(customerEditor, label);
                if (field && value) setReactInput(field, value);
              }
              lookup.textContent = "Informations récupérées ✓";
            } catch (error) {
              lookup.textContent = error instanceof Error ? error.message : "Recherche impossible";
            } finally {
              lookup.removeAttribute("disabled");
            }
          });
          siret.closest("label")?.insertAdjacentElement("afterend", lookup);
        }
      }

      const emailSheet = document.querySelector<HTMLElement>(".rm-v2-email");
      const emailTextarea = emailSheet?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
      if (emailTextarea && !emailTextarea.dataset.rapProfileApplied && emailTextarea.value.includes("CHAPET SAS")) {
        const profile = readCompanyProfile(window.localStorage);
        const number = emailSheet?.querySelector("footer strong")?.textContent?.replace(/\.pdf$/i, "") || "";
        const isInvoice = /facture/i.test(emailTextarea.value);
        setReactInput(emailTextarea, buildDocumentEmailMessage(profile, isInvoice ? "Facture" : "Devis", number));
        emailTextarea.dataset.rapProfileApplied = "true";
      }
    };

    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest("button");
      const text = button?.textContent?.trim() ?? "";
      if (/Modifier les informations|Ouvrir tous les paramètres/i.test(text)) {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new Event("projetchapet:open-company-profile"));
      }
    };
    document.addEventListener("click", click, true);
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { subtree: true, childList: true });
    enhance();
    return () => { observer.disconnect(); document.removeEventListener("click", click, true); };
  }, []);

  const portal = reviewHost && suggestions.length > 0 ? createPortal(
    <section className="rap-suggestions" aria-label="Suggestions de chantier">
      <div className="rap-suggestion-title"><Lightbulb size={19} /><div><strong>À vérifier avant de générer</strong><small>Suggestions selon le chantier · aucun prix n’est inventé</small></div></div>
      <div className="rap-suggestion-list">{suggestions.map((suggestion: RappidosSuggestion) => {
        const selected = selectedIds.includes(suggestion.id);
        return <button type="button" key={suggestion.id} className={selected ? "selected" : ""} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== suggestion.id) : [...current, suggestion.id])}><span>{selected ? <Check size={16} /> : <Lightbulb size={16} />}</span><div><strong>{suggestion.label}</strong><small>{suggestion.reason}</small></div></button>;
      })}</div>
      {selectedIds.length > 0 && <p>Les postes cochés seront ajoutés sans quantité, sans prix et sans TVA : l’artisan garde le contrôle.</p>}
    </section>,
    reviewHost,
  ) : null;

  return <>{portal}<style>{`
    .rap-keyboard-toggle{margin-top:4px!important}.mai-capture.rap-processing textarea,.mai-capture.rap-processing .rap-keyboard-toggle{display:none!important}.mai-capture.rap-processing:before{content:"";width:46px;height:46px;border:4px solid #d9e5ef;border-top-color:#215d88;border-radius:50%;animation:rap-spin .85s linear infinite;margin:8px auto 2px}.mai-capture.rap-processing:after{content:"Analyse du chantier en cours";display:block;font-size:12px;font-weight:800;color:#50728e;margin-bottom:5px}@keyframes rap-spin{to{transform:rotate(360deg)}}.rap-suggestions{margin:12px 0;padding:13px;border:1px solid #d9e5ef;border-radius:16px;background:#f7fafc;display:grid;gap:10px}.rap-suggestion-title{display:flex;gap:9px;align-items:center;color:#214f73}.rap-suggestion-title div{display:grid;gap:2px}.rap-suggestion-title strong{font-size:13px}.rap-suggestion-title small{font-size:10px;color:#6b7e8f}.rap-suggestion-list{display:grid;gap:7px}.rap-suggestion-list button{border:1px solid #d7e1ea;border-radius:12px;background:#fff;text-align:left;padding:10px;display:flex;gap:9px;color:#233f55}.rap-suggestion-list button>span{width:26px;height:26px;border-radius:50%;background:#edf3f8;display:grid;place-items:center;flex:none}.rap-suggestion-list button div{display:grid;gap:2px}.rap-suggestion-list button strong{font-size:12px}.rap-suggestion-list button small{font-size:10px;line-height:1.3;color:#6b7e8f}.rap-suggestion-list button.selected{border-color:#2a6c98;background:#eef6fb}.rap-suggestion-list button.selected>span{background:#2a6c98;color:#fff}.rap-suggestions p{margin:0;font-size:10px;color:#65798a}.rap-siret-lookup{grid-column:1/-1;border:1px solid #bfd2e1!important;background:#edf5fb!important;color:#24597d!important;border-radius:10px!important;padding:10px 12px!important;font-weight:800!important}
  `}</style></>;
}
