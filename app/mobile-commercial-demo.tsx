"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  BriefcaseBusiness,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileJson,
  FileText,
  Filter,
  HardHat,
  History,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobToBase64 } from "@/lib/document-tools";
import {
  COMMERCIAL_DEMO_STORAGE_KEY,
  addProjectIssue,
  addProjectPhoto,
  appendActivity,
  buildCommercialNotifications,
  calculateProjectProgress,
  exportCommercialBackup,
  filterBusinessDocuments,
  findBusinessDocument,
  findCustomer,
  hasActiveDocumentFilters,
  importCommercialBackup,
  readCommercialDemoState,
  seedCommercialDemoState,
  setProjectIssueResolved,
  statusOptions,
  toggleProjectStep,
  writeCommercialDemoState,
  type CommercialCompanySettings,
  type CommercialDemoState,
  type CommercialProjectIssue,
  type DemoDocumentKind,
  type DocumentFilters,
  type ProjectTab,
} from "@/lib/mobile-commercial-demo";
import {
  buildBusinessDocumentPdf,
  documentFileName,
  isMobileQuote,
  type MobileBusinessDocument,
} from "@/lib/mobile-document-pdf";
import {
  QUOTE_META_STORAGE_KEY,
  parseMobileWorkspace,
  readQuoteInternalMeta,
} from "@/lib/mobile-quote-preview";
import type { MobileWorkspace } from "@/lib/mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";

type Overlay =
  | "filters"
  | "notifications"
  | "projects"
  | "activity"
  | "backup"
  | "settings"
  | "email"
  | null;

type EmailDraft = {
  document: MobileBusinessDocument;
  recipient: string;
  subject: string;
  message: string;
  withoutPrices: boolean;
};

const normalizeText = (value: string) =>
  value.trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

const dateFr = (value: string) =>
  value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
        new Date(`${value}T12:00:00`),
      )
    : "—";

const timeFr = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const emptyFilters = (): DocumentFilters => ({
  customerId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
});

function readWorkspace() {
  return parseMobileWorkspace(window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
}

function downloadText(content: string, filename: string) {
  downloadBlob(new Blob([content], { type: "application/json;charset=utf-8" }), filename);
}

async function compressImage(file: File) {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de la photo impossible."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const instance = new Image();
    instance.onerror = () => reject(new Error("Photo incompatible."));
    instance.onload = () => resolve(instance);
    instance.src = raw;
  });
  const max = 960;
  const ratio = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return raw;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function overlayTitle(overlay: Overlay) {
  if (overlay === "filters") return "Filtres avancés";
  if (overlay === "notifications") return "Centre d’attention";
  if (overlay === "projects") return "Chantiers & équipe";
  if (overlay === "activity") return "Journal d’activité";
  if (overlay === "backup") return "Sauvegarde & transfert";
  if (overlay === "settings") return "Entreprise & réglages";
  if (overlay === "email") return "Envoyer le document";
  return "Projet Chapet";
}

export default function MobileCommercialDemo() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null);
  const [commercial, setCommercial] = useState<CommercialDemoState>(() => seedCommercialDemoState());
  const [filterKind, setFilterKind] = useState<DemoDocumentKind>("quote");
  const [filterDraft, setFilterDraft] = useState<DocumentFilters>(() => emptyFilters());
  const [selectedProjectId, setSelectedProjectId] = useState("PROJECT-BELLEVUE");
  const [projectTab, setProjectTab] = useState<ProjectTab>("suivi");
  const [workerMode, setWorkerMode] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueDraft, setIssueDraft] = useState<Pick<CommercialProjectIssue, "title" | "detail" | "severity">>({
    title: "",
    detail: "",
    severity: "À surveiller",
  });
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<CommercialCompanySettings>(() => seedCommercialDemoState().company);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2_700);
  }, []);

  const refreshWorkspace = useCallback(() => {
    const next = readWorkspace();
    if (next) setWorkspace(next);
  }, []);

  const logActivity = useCallback(
    (event: Parameters<typeof appendActivity>[1]) => {
      setCommercial((current) => appendActivity(current, event));
    },
    [],
  );

  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    const initial = readCommercialDemoState(window.localStorage);
    setCommercial(initial);
    setCompanyDraft(initial.company);
    refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    writeCommercialDemoState(window.localStorage, commercial);
    document.documentElement.dataset.chapetAccent = commercial.company.accent;
  }, [commercial]);

  const selectedProject = useMemo(
    () => commercial.projects.find((project) => project.id === selectedProjectId) ?? commercial.projects[0] ?? null,
    [commercial.projects, selectedProjectId],
  );

  const notifications = useMemo(
    () => workspace ? buildCommercialNotifications(workspace, commercial) : [],
    [workspace, commercial],
  );

  const activeFilterCount = useCallback(
    (kind: DemoDocumentKind) => {
      const filters = commercial.filters[kind];
      return Object.values(filters).filter(Boolean).length;
    },
    [commercial.filters],
  );

  const applyDomFilters = useCallback(() => {
    if (!workspace) return;
    const search = document.querySelector<HTMLInputElement>(".rm-search input");
    if (!search) return;
    const kind: DemoDocumentKind = normalizeText(search.placeholder).includes("facture") ? "invoice" : "quote";
    const documents = kind === "quote" ? workspace.quotes : workspace.invoices;
    const allowed = new Set(filterBusinessDocuments(documents, commercial.filters[kind]).map((item) => item.number));
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".rm-document-card"));
    let visible = 0;
    cards.forEach((card) => {
      const number = card.querySelector(".rm-document-main small")?.textContent?.trim() || "";
      const hidden = !allowed.has(number);
      card.classList.toggle("rm-commercial-hidden", hidden);
      if (!hidden) visible += 1;
    });
    const section = search.closest(".rm-section");
    const list = section?.querySelector<HTMLElement>(".rm-list");
    let empty = section?.querySelector<HTMLElement>(".rm-commercial-empty");
    if (list && visible === 0) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "rm-commercial-empty";
        empty.innerHTML = "<strong>Aucun document ne correspond</strong><span>Modifiez ou réinitialisez les filtres.</span>";
        list.insertAdjacentElement("afterend", empty);
      }
    } else {
      empty?.remove();
    }
    const trigger = section?.querySelector<HTMLElement>(`.rm-commercial-filter-trigger[data-kind="${kind}"]`);
    const badge = trigger?.querySelector<HTMLElement>("b");
    const count = activeFilterCount(kind);
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
  }, [activeFilterCount, commercial.filters, workspace]);

  const enhanceDom = useCallback(() => {
    const search = document.querySelector<HTMLInputElement>(".rm-search input");
    if (search) {
      const kind: DemoDocumentKind = normalizeText(search.placeholder).includes("facture") ? "invoice" : "quote";
      const container = search.closest<HTMLElement>(".rm-search");
      if (container && !container.querySelector(".rm-commercial-filter-trigger")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rm-commercial-filter-trigger";
        button.dataset.kind = kind;
        button.dataset.commercialAction = "filters";
        button.setAttribute("aria-label", kind === "quote" ? "Filtrer les devis" : "Filtrer les factures");
        button.innerHTML = '<span aria-hidden="true">⌄</span><em>Filtres</em><b hidden>0</b>';
        container.appendChild(button);
      }
    }

    const drawerList = document.querySelector<HTMLElement>(".rm-drawer-list");
    if (drawerList && !drawerList.querySelector("[data-commercial-action='activity']")) {
      const activityButton = document.createElement("button");
      activityButton.type = "button";
      activityButton.dataset.commercialAction = "activity";
      activityButton.innerHTML = "<span>◷</span><div><strong>Journal d’activité</strong><small>Statuts, envois et suivi des chantiers</small></div><span>›</span>";
      drawerList.appendChild(activityButton);
      const backupButton = document.createElement("button");
      backupButton.type = "button";
      backupButton.dataset.commercialAction = "backup";
      backupButton.innerHTML = "<span>⇩</span><div><strong>Sauvegarde & transfert</strong><small>Exporter ou restaurer toutes les données</small></div><span>›</span>";
      drawerList.appendChild(backupButton);
    }

    const actions = document.querySelector<HTMLElement>(".rm-detail-actions");
    if (actions && !actions.querySelector("[data-commercial-action='activity']")) {
      const historyButton = document.createElement("button");
      historyButton.type = "button";
      historyButton.dataset.commercialAction = "activity";
      historyButton.innerHTML = "<span aria-hidden='true'>◷</span> Historique";
      actions.appendChild(historyButton);
    }

    applyDomFilters();
  }, [applyDomFilters]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    const observer = new MutationObserver(() => {
      enhanceDom();
      window.setTimeout(refreshWorkspace, 20);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceDom();

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;
      const action = button.dataset.commercialAction;
      const text = normalizeText(button.textContent || "");

      if (action === "filters") {
        event.preventDefault();
        event.stopPropagation();
        const kind = button.dataset.kind === "invoice" ? "invoice" : "quote";
        setFilterKind(kind);
        setFilterDraft({ ...commercial.filters[kind] });
        setOverlay("filters");
        return;
      }
      if (action === "activity") {
        event.preventDefault();
        event.stopPropagation();
        setOverlay("activity");
        return;
      }
      if (action === "backup") {
        event.preventDefault();
        event.stopPropagation();
        setOverlay("backup");
        return;
      }

      if (button.getAttribute("aria-label") === "Notifications") {
        event.preventDefault();
        event.stopPropagation();
        refreshWorkspace();
        setOverlay("notifications");
        return;
      }

      if (text.includes("interface collaborateurs")) {
        event.preventDefault();
        event.stopPropagation();
        setWorkerMode(false);
        setProjectTab("suivi");
        setOverlay("projects");
        window.setTimeout(() => document.querySelector<HTMLButtonElement>(".rm-side-drawer header button")?.click(), 0);
        return;
      }

      if (text.includes("modifier les informations") || text.includes("ouvrir tous les paramètres")) {
        event.preventDefault();
        event.stopPropagation();
        setCompanyDraft(commercial.company);
        setOverlay("settings");
        window.setTimeout(() => document.querySelector<HTMLButtonElement>(".rm-side-drawer header button")?.click(), 0);
        return;
      }

      if (text === "envoyer pdf") {
        event.preventDefault();
        event.stopPropagation();
        const number = button.closest(".rm-detail-sheet")?.querySelector("h2")?.textContent?.trim() || "";
        const currentWorkspace = readWorkspace();
        const found = currentWorkspace ? findBusinessDocument(currentWorkspace, number) : null;
        if (!found || !currentWorkspace) {
          notify("Document introuvable.");
          return;
        }
        const customer = findCustomer(currentWorkspace, found.document.customerId);
        setEmail({
          document: found.document,
          recipient: customer?.emails.find(Boolean) || "",
          subject: `${isMobileQuote(found.document) ? "Votre devis" : "Votre facture"} ${found.document.number}`,
          message: `Bonjour,\n\nVeuillez trouver votre ${isMobileQuote(found.document) ? "devis" : "facture"} ${found.document.number} en pièce jointe.\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${commercial.company.displayName}`,
          withoutPrices: false,
        });
        setOverlay("email");
        return;
      }

      if (button.closest(".rm-status-editor")) {
        const number = button.closest(".rm-detail-sheet")?.querySelector("h2")?.textContent?.trim();
        window.setTimeout(() => {
          logActivity({
            kind: "status",
            message: `${number || "Document"} passé au statut « ${button.textContent?.trim()} ».",
            documentNumber: number,
          });
          refreshWorkspace();
        }, 80);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, [commercial.company, commercial.filters, enhanceDom, logActivity, notify, refreshWorkspace]);

  useEffect(() => {
    applyDomFilters();
  }, [applyDomFilters]);

  const saveFilters = () => {
    setCommercial((current) => ({
      ...current,
      filters: { ...current.filters, [filterKind]: filterDraft },
    }));
    setOverlay(null);
    notify("Filtres appliqués.");
  };

  const resetFilters = () => {
    const reset = emptyFilters();
    setFilterDraft(reset);
    setCommercial((current) => ({
      ...current,
      filters: { ...current.filters, [filterKind]: reset },
    }));
    setOverlay(null);
    notify("Filtres réinitialisés.");
  };

  const updateStep = (stepId: string) => {
    if (!selectedProject) return;
    const step = selectedProject.steps.find((item) => item.id === stepId);
    setCommercial((current) => appendActivity(
      toggleProjectStep(current, selectedProject.id, stepId),
      {
        kind: "chantier",
        message: `${selectedProject.name} · étape « ${step?.label || "Chantier"} » ${step?.done ? "rouverte" : "terminée"}.`,
        projectId: selectedProject.id,
      },
    ));
  };

  const submitIssue = () => {
    if (!selectedProject || !issueDraft.title.trim()) {
      notify("Donnez un titre au signalement.");
      return;
    }
    setCommercial((current) => appendActivity(
      addProjectIssue(current, selectedProject.id, {
        ...issueDraft,
        title: issueDraft.title.trim(),
        detail: issueDraft.detail.trim(),
      }),
      {
        kind: "chantier",
        message: `${selectedProject.name} · nouveau signalement « ${issueDraft.title.trim()} ».",
        projectId: selectedProject.id,
      },
    ));
    setIssueDraft({ title: "", detail: "", severity: "À surveiller" });
    setShowIssueForm(false);
    notify("Signalement enregistré.");
  };

  const handlePhoto = async (file: File | null) => {
    if (!file || !selectedProject) return;
    try {
      const dataUrl = await compressImage(file);
      setCommercial((current) => appendActivity(
        addProjectPhoto(current, selectedProject.id, {
          name: file.name,
          caption: "Photo chantier",
          dataUrl,
        }),
        {
          kind: "chantier",
          message: `${selectedProject.name} · photo ajoutée au suivi.",
          projectId: selectedProject.id,
        },
      ));
      notify("Photo ajoutée au chantier.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ajout de la photo impossible.");
    }
  };

  const downloadProjectDocument = async (withoutPrices: boolean) => {
    if (!workspace || !selectedProject) return;
    const linked = selectedProject.quoteId
      ? workspace.quotes.find((quote) => quote.id === selectedProject.quoteId)
      : null;
    const document = linked ?? (selectedProject.invoiceId
      ? workspace.invoices.find((invoice) => invoice.id === selectedProject.invoiceId)
      : null);
    if (!document) {
      notify("Aucun document lié à ce chantier.");
      return;
    }
    const customer = findCustomer(workspace, document.customerId);
    const meta = isMobileQuote(document)
      ? readQuoteInternalMeta(window.localStorage, document.number)
      : undefined;
    const blob = await buildBusinessDocumentPdf({
      document,
      customer,
      company: commercial.company,
      quoteMeta: meta,
      withoutPrices,
    });
    downloadBlob(blob, documentFileName(document, withoutPrices));
    logActivity({
      kind: "document",
      message: `${document.number} téléchargé${withoutPrices ? " sans prix pour l’équipe" : ""}.`,
      documentNumber: document.number,
      projectId: selectedProject.id,
    });
  };

  const sendEmail = async () => {
    if (!email || !workspace || !email.recipient.trim()) {
      notify("Renseignez l’adresse e-mail du destinataire.");
      return;
    }
    const customer = findCustomer(workspace, email.document.customerId);
    const quoteMeta = isMobileQuote(email.document)
      ? readQuoteInternalMeta(window.localStorage, email.document.number)
      : undefined;
    setEmailBusy(true);
    try {
      const blob = await buildBusinessDocumentPdf({
        document: email.document,
        customer,
        company: commercial.company,
        quoteMeta,
        withoutPrices: email.withoutPrices,
      });
      const response = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.recipient.trim(),
          subject: email.subject,
          html: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${email.message.replaceAll("\n", "<br>")}</div>`,
          attachments: [{
            filename: documentFileName(email.document, email.withoutPrices),
            content: await blobToBase64(blob),
          }],
        }),
      });
      if (!response.ok) {
        downloadBlob(blob, documentFileName(email.document, email.withoutPrices));
        window.location.href = `mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(`${email.message}\n\nLe PDF a été téléchargé : ajoutez-le en pièce jointe.`)}`;
        notify("PDF téléchargé et application Mail ouverte.");
      } else {
        notify(`Document envoyé à ${email.recipient}.`);
      }
      logActivity({
        kind: "email",
        message: `${email.document.number} envoyé à ${email.recipient}.`,
        documentNumber: email.document.number,
      });
      setOverlay(null);
      setEmail(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setEmailBusy(false);
    }
  };

  const saveCompany = () => {
    setCommercial((current) => appendActivity(
      { ...current, company: { ...companyDraft, quoteValidityDays: Math.max(1, Number(companyDraft.quoteValidityDays) || 60) } },
      { kind: "settings", message: "Informations de l’entreprise mises à jour." },
    ));
    setOverlay(null);
    notify("Réglages enregistrés.");
  };

  const exportBackup = () => {
    try {
      const content = exportCommercialBackup(window.localStorage);
      downloadText(content, `projet-chapet-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
      logActivity({ kind: "data", message: "Sauvegarde complète exportée." });
      notify("Sauvegarde téléchargée.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Export impossible.");
    }
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    try {
      importCommercialBackup(window.localStorage, await file.text());
      notify("Sauvegarde restaurée. Rechargement…");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Restauration impossible.");
    }
  };

  const resetDemo = () => {
    if (!window.confirm("Réinitialiser uniquement les compléments de démonstration ?")) return;
    window.localStorage.removeItem(COMMERCIAL_DEMO_STORAGE_KEY);
    const reset = seedCommercialDemoState();
    setCommercial(reset);
    setCompanyDraft(reset.company);
    notify("Compléments de démonstration réinitialisés.");
  };

  const openNotification = (notification: (typeof notifications)[number]) => {
    if (notification.projectId) {
      setSelectedProjectId(notification.projectId);
      setOverlay("projects");
      return;
    }
    if (!notification.documentKind || !notification.documentNumber) return;
    const kind = notification.documentKind;
    setCommercial((current) => ({
      ...current,
      filters: { ...current.filters, [kind]: emptyFilters() },
    }));
    setOverlay(null);
    const navLabel = kind === "quote" ? "Devis" : "Factures";
    document.querySelectorAll<HTMLButtonElement>(".rm-bottom-nav button").forEach((button) => {
      if (button.textContent?.includes(navLabel)) button.click();
    });
    window.setTimeout(() => {
      const card = Array.from(document.querySelectorAll<HTMLButtonElement>(".rm-document-card"))
        .find((item) => item.textContent?.includes(notification.documentNumber || ""));
      card?.click();
    }, 120);
  };

  if (!overlay && !toast) return null;

  return (
    <>
      {overlay && (
        <div className="rm-commercial-backdrop" role="dialog" aria-modal="true" aria-label={overlayTitle(overlay)}>
          <section className={`rm-commercial-panel rm-commercial-${overlay}`}>
            <header className="rm-commercial-header">
              <button type="button" onClick={() => { setOverlay(null); setWorkerMode(false); }} aria-label="Fermer">
                {overlay === "projects" && workerMode ? <ArrowLeft size={22} /> : <X size={22} />}
              </button>
              <div>
                <small>PROJET CHAPET</small>
                <h2>{overlay === "projects" && workerMode ? "Vue collaborateur" : overlayTitle(overlay)}</h2>
              </div>
              <span className="rm-commercial-live"><i /> Démo locale</span>
            </header>

            {overlay === "filters" && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-intro">
                  <Filter size={22} />
                  <div><strong>Affinez la liste en quelques secondes</strong><span>Les filtres se combinent avec la recherche et les statuts rapides.</span></div>
                </div>
                <div className="rm-commercial-form">
                  <label>Client<select value={filterDraft.customerId} onChange={(event) => setFilterDraft({ ...filterDraft, customerId: event.target.value })}><option value="">Tous les clients</option>{workspace?.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.kind === "Professionnel" ? customer.companyName : `${customer.civility} ${customer.lastName} ${customer.firstName}`}</option>)}</select></label>
                  <label>Statut<select value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value })}><option value="">Tous les statuts</option>{statusOptions(filterKind).map((status) => <option key={status}>{status}</option>)}</select></label>
                  <div className="rm-commercial-two"><label>Émis après<input type="date" value={filterDraft.dateFrom} onChange={(event) => setFilterDraft({ ...filterDraft, dateFrom: event.target.value })} /></label><label>Émis avant<input type="date" value={filterDraft.dateTo} onChange={(event) => setFilterDraft({ ...filterDraft, dateTo: event.target.value })} /></label></div>
                  <div className="rm-commercial-two"><label>Montant minimum<input type="number" inputMode="decimal" placeholder="0 €" value={filterDraft.minAmount} onChange={(event) => setFilterDraft({ ...filterDraft, minAmount: event.target.value })} /></label><label>Montant maximum<input type="number" inputMode="decimal" placeholder="Sans limite" value={filterDraft.maxAmount} onChange={(event) => setFilterDraft({ ...filterDraft, maxAmount: event.target.value })} /></label></div>
                </div>
                <footer className="rm-commercial-footer"><button className="secondary" type="button" onClick={resetFilters}><RefreshCw size={18} /> Réinitialiser</button><button className="primary" type="button" onClick={saveFilters}><Check size={18} /> Appliquer les filtres</button></footer>
              </div>
            )}

            {overlay === "notifications" && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-notification-summary"><BellRing size={23} /><div><strong>{notifications.length} point{notifications.length > 1 ? "s" : ""} à regarder</strong><span>Échéances, relances, agenda et blocages chantier.</span></div></div>
                <div className="rm-commercial-notifications">{notifications.map((notification) => <button type="button" key={notification.id} className={notification.tone} onClick={() => openNotification(notification)}><span className="icon">{notification.tone === "danger" ? <AlertTriangle size={19} /> : notification.tone === "success" ? <CheckCircle2 size={19} /> : <BellRing size={19} />}</span><div><strong>{notification.title}</strong><small>{notification.detail}</small></div>{(notification.documentNumber || notification.projectId) && <ChevronRight size={18} />}</button>)}</div>
              </div>
            )}

            {overlay === "activity" && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-intro"><History size={22} /><div><strong>Traçabilité métier</strong><span>Les actions importantes restent visibles dans un historique simple.</span></div></div>
                <div className="rm-commercial-timeline">{commercial.activity.map((event) => <article key={event.id}><span className={event.kind}>{event.kind === "status" ? <RefreshCw size={16} /> : event.kind === "chantier" ? <HardHat size={16} /> : event.kind === "email" ? <Mail size={16} /> : event.kind === "data" ? <Save size={16} /> : <FileText size={16} />}</span><div><strong>{event.message}</strong><small>{timeFr(event.createdAt)}{event.documentNumber ? ` · ${event.documentNumber}` : ""}</small></div></article>)}</div>
              </div>
            )}

            {overlay === "projects" && selectedProject && (
              <div className="rm-commercial-body rm-project-body">
                {!workerMode ? <>
                  <div className="rm-project-switcher">{commercial.projects.map((project) => <button type="button" key={project.id} className={selectedProject.id === project.id ? "active" : ""} onClick={() => { setSelectedProjectId(project.id); setProjectTab("suivi"); }}><div><strong>{project.name}</strong><small>{project.subtitle}</small></div><span>{calculateProjectProgress(project)} %</span></button>)}</div>
                  <section className="rm-project-hero"><div className="rm-project-hero-top"><span className={`status ${selectedProject.status.toLowerCase().replaceAll(" ", "-")}`}>{selectedProject.status}</span><button type="button" onClick={() => setWorkerMode(true)}><ShieldCheck size={17} /> Voir comme l’équipe</button></div><h3>{selectedProject.name}</h3><p>{selectedProject.subtitle}</p><div className="rm-project-location"><MapPin size={16} /> {selectedProject.address}</div><div className="rm-project-progress"><div><span>Avancement</span><strong>{calculateProjectProgress(selectedProject)} %</strong></div><i><b style={{ width: `${calculateProjectProgress(selectedProject)}%` }} /></i><small>Prochaine intervention : {dateFr(selectedProject.nextVisit)}</small></div></section>
                  <nav className="rm-project-tabs">{(["suivi", "equipe", "photos", "documents"] as ProjectTab[]).map((tab) => <button type="button" key={tab} className={projectTab === tab ? "active" : ""} onClick={() => setProjectTab(tab)}>{tab === "suivi" ? "Suivi" : tab === "equipe" ? "Équipe" : tab === "photos" ? "Photos" : "Documents"}</button>)}</nav>

                  {projectTab === "suivi" && <div className="rm-project-section"><div className="rm-project-section-title"><div><small>ÉTAPES</small><strong>Planning opérationnel</strong></div><span>{selectedProject.steps.filter((step) => step.done).length}/{selectedProject.steps.length}</span></div><div className="rm-project-steps">{selectedProject.steps.map((step) => { const collaborator = commercial.collaborators.find((item) => item.id === step.assigneeId); return <button type="button" key={step.id} className={step.done ? "done" : ""} onClick={() => updateStep(step.id)}><span>{step.done ? <Check size={18} /> : null}</span><div><strong>{step.label}</strong><small>{collaborator?.name || "Non affecté"} · {dateFr(step.dueDate)}</small></div></button>; })}</div><div className="rm-project-section-title issues"><div><small>SIGNALEMENTS</small><strong>Points à traiter</strong></div><button type="button" onClick={() => setShowIssueForm((value) => !value)}>+ Ajouter</button></div>{showIssueForm && <div className="rm-project-issue-form"><input placeholder="Titre du signalement" value={issueDraft.title} onChange={(event) => setIssueDraft({ ...issueDraft, title: event.target.value })} /><textarea placeholder="Détail utile à l’équipe" value={issueDraft.detail} onChange={(event) => setIssueDraft({ ...issueDraft, detail: event.target.value })} /><select value={issueDraft.severity} onChange={(event) => setIssueDraft({ ...issueDraft, severity: event.target.value as CommercialProjectIssue["severity"] })}><option>Information</option><option>À surveiller</option><option>Bloquant</option></select><button type="button" onClick={submitIssue}><AlertTriangle size={17} /> Enregistrer</button></div>}<div className="rm-project-issues">{selectedProject.issues.map((issue) => <article key={issue.id} className={`${issue.severity.toLowerCase().replaceAll(" ", "-")} ${issue.resolved ? "resolved" : ""}`}><span><AlertTriangle size={17} /></span><div><strong>{issue.title}</strong><small>{issue.detail}</small></div><button type="button" onClick={() => setCommercial((current) => appendActivity(setProjectIssueResolved(current, selectedProject.id, issue.id, !issue.resolved), { kind: "chantier", message: `${selectedProject.name} · signalement « ${issue.title} » ${issue.resolved ? "rouvert" : "résolu"}.`, projectId: selectedProject.id }))}>{issue.resolved ? "Rouvrir" : "Résoudre"}</button></article>)}{selectedProject.issues.length === 0 && <div className="rm-project-empty"><CheckCircle2 size={22} /><strong>Aucun point bloquant</strong><span>Le chantier peut avancer normalement.</span></div>}</div></div>}

                  {projectTab === "equipe" && <div className="rm-project-section"><div className="rm-project-section-title"><div><small>COLLABORATEURS</small><strong>Équipe affectée</strong></div><span>{selectedProject.teamIds.length}</span></div><div className="rm-project-team">{commercial.collaborators.map((person) => { const assigned = selectedProject.teamIds.includes(person.id); return <article key={person.id}><span>{person.initials}</span><div><strong>{person.name}</strong><small>{person.role}</small><a href={`tel:${person.phone.replaceAll(" ", "")}`}>{person.phone}</a></div><button type="button" className={assigned ? "assigned" : ""} onClick={() => setCommercial((current) => ({ ...current, projects: current.projects.map((project) => project.id !== selectedProject.id ? project : { ...project, teamIds: assigned ? project.teamIds.filter((id) => id !== person.id) : [...project.teamIds, person.id] }) }))}>{assigned ? "Affecté" : "Affecter"}</button></article>; })}</div></div>}

                  {projectTab === "photos" && <div className="rm-project-section"><label className="rm-project-photo-upload"><Camera size={24} /><strong>Ajouter une photo chantier</strong><span>Appareil photo ou photothèque</span><input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event.target.files?.[0] || null)} /></label><div className="rm-project-gallery">{selectedProject.photos.map((photo) => <figure key={photo.id}>{photo.dataUrl ? <img src={photo.dataUrl} alt={photo.caption} /> : <Camera size={28} />}<figcaption><strong>{photo.caption}</strong><small>{timeFr(photo.createdAt)}</small></figcaption></figure>)}{selectedProject.photos.length === 0 && <div className="rm-project-empty"><Camera size={22} /><strong>Aucune photo pour le moment</strong><span>Ajoutez la première photo de suivi.</span></div>}</div></div>}

                  {projectTab === "documents" && <div className="rm-project-section"><div className="rm-project-document-card"><FileText size={25} /><div><strong>Document client</strong><small>Prix, TVA, remise et conditions de validation</small></div><button type="button" onClick={() => void downloadProjectDocument(false)}><Download size={18} /> PDF</button></div><div className="rm-project-document-card worker"><ClipboardCheck size={25} /><div><strong>Document équipe sans prix</strong><small>Prestations, quantités et consignes uniquement</small></div><button type="button" onClick={() => void downloadProjectDocument(true)}><Download size={18} /> PDF</button></div><div className="rm-project-document-info"><ShieldCheck size={19} /><span>Les notes personnelles, marges et prix restent invisibles dans la version collaborateur.</span></div></div>}
                </> : <div className="rm-worker-view"><section><span className="rm-worker-badge"><HardHat size={17} /> ESPACE ÉQUIPE</span><h3>{selectedProject.name}</h3><p>{selectedProject.subtitle}</p><div><MapPin size={16} /> {selectedProject.address}</div></section><div className="rm-worker-progress"><strong>Avancement du chantier</strong><span>{calculateProjectProgress(selectedProject)} %</span><i><b style={{ width: `${calculateProjectProgress(selectedProject)}%` }} /></i></div><h4>Mes étapes</h4><div className="rm-project-steps">{selectedProject.steps.map((step) => <button type="button" key={step.id} className={step.done ? "done" : ""} onClick={() => updateStep(step.id)}><span>{step.done ? <Check size={18} /> : null}</span><div><strong>{step.label}</strong><small>À réaliser avant le {dateFr(step.dueDate)}</small></div></button>)}</div><div className="rm-worker-actions"><label><Camera size={20} /><span>Ajouter une photo</span><input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event.target.files?.[0] || null)} /></label><button type="button" onClick={() => setShowIssueForm(true)}><AlertTriangle size={20} /> Signaler un problème</button><button type="button" onClick={() => void downloadProjectDocument(true)}><Download size={20} /> Consulter le document</button></div>{showIssueForm && <div className="rm-project-issue-form"><input placeholder="Quel est le problème ?" value={issueDraft.title} onChange={(event) => setIssueDraft({ ...issueDraft, title: event.target.value })} /><textarea placeholder="Ajoutez une précision utile" value={issueDraft.detail} onChange={(event) => setIssueDraft({ ...issueDraft, detail: event.target.value })} /><select value={issueDraft.severity} onChange={(event) => setIssueDraft({ ...issueDraft, severity: event.target.value as CommercialProjectIssue["severity"] })}><option>Information</option><option>À surveiller</option><option>Bloquant</option></select><button type="button" onClick={submitIssue}>Envoyer au responsable</button></div>}</div>}
              </div>
            )}

            {overlay === "backup" && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-intro"><ShieldCheck size={22} /><div><strong>Vos données restent récupérables</strong><span>La sauvegarde contient clients, devis, factures, agenda, remises, chantiers et réglages.</span></div></div>
                <div className="rm-backup-cards"><button type="button" onClick={exportBackup}><Download size={24} /><div><strong>Exporter une sauvegarde complète</strong><span>Fichier JSON horodaté, utilisable sur un autre appareil.</span></div><ChevronRight size={18} /></button><label><Upload size={24} /><div><strong>Restaurer une sauvegarde</strong><span>Importez un fichier précédemment exporté.</span></div><ChevronRight size={18} /><input type="file" accept="application/json,.json" onChange={(event) => void importBackup(event.target.files?.[0] || null)} /></label><button type="button" className="subtle" onClick={resetDemo}><RefreshCw size={22} /><div><strong>Réinitialiser les compléments de démo</strong><span>Conserve les devis, factures et clients existants.</span></div></button></div>
              </div>
            )}

            {overlay === "settings" && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-intro"><BriefcaseBusiness size={22} /><div><strong>Informations utilisées dans les documents</strong><span>Ces données alimentent les PDF, les e-mails et les écrans de démonstration.</span></div></div>
                <div className="rm-commercial-form"><label>Nom affiché<input value={companyDraft.displayName} onChange={(event) => setCompanyDraft({ ...companyDraft, displayName: event.target.value })} /></label><label>Raison sociale<input value={companyDraft.legalName} onChange={(event) => setCompanyDraft({ ...companyDraft, legalName: event.target.value })} /></label><div className="rm-commercial-two"><label>SIRET<input value={companyDraft.siret} onChange={(event) => setCompanyDraft({ ...companyDraft, siret: event.target.value })} /></label><label>N° TVA<input value={companyDraft.vat} onChange={(event) => setCompanyDraft({ ...companyDraft, vat: event.target.value })} /></label></div><div className="rm-commercial-two"><label>E-mail<input type="email" value={companyDraft.email} onChange={(event) => setCompanyDraft({ ...companyDraft, email: event.target.value })} /></label><label>E-mail comptable<input type="email" value={companyDraft.accountingEmail} onChange={(event) => setCompanyDraft({ ...companyDraft, accountingEmail: event.target.value })} /></label></div><label>Téléphone<input value={companyDraft.phone} onChange={(event) => setCompanyDraft({ ...companyDraft, phone: event.target.value })} /></label><label>Adresse<input value={companyDraft.address} onChange={(event) => setCompanyDraft({ ...companyDraft, address: event.target.value })} /></label><div className="rm-commercial-two"><label>Code postal<input value={companyDraft.postalCode} onChange={(event) => setCompanyDraft({ ...companyDraft, postalCode: event.target.value })} /></label><label>Ville<input value={companyDraft.city} onChange={(event) => setCompanyDraft({ ...companyDraft, city: event.target.value })} /></label></div><div className="rm-commercial-two"><label>Validité devis (jours)<input type="number" min="1" value={companyDraft.quoteValidityDays} onChange={(event) => setCompanyDraft({ ...companyDraft, quoteValidityDays: Number(event.target.value) })} /></label><label>Couleur principale<select value={companyDraft.accent} onChange={(event) => setCompanyDraft({ ...companyDraft, accent: event.target.value as CommercialCompanySettings["accent"] })}><option value="blue">Bleu professionnel</option><option value="indigo">Indigo</option><option value="emerald">Vert chantier</option></select></label></div><label>Conditions de règlement<textarea rows={3} value={companyDraft.paymentTerms} onChange={(event) => setCompanyDraft({ ...companyDraft, paymentTerms: event.target.value })} /></label></div><footer className="rm-commercial-footer"><button className="secondary" type="button" onClick={() => setOverlay(null)}>Annuler</button><button className="primary" type="button" onClick={saveCompany}><Save size={18} /> Enregistrer</button></footer>
              </div>
            )}

            {overlay === "email" && email && (
              <div className="rm-commercial-body">
                <div className="rm-commercial-intro"><Mail size={22} /><div><strong>{email.document.number}</strong><span>Le PDF joint reprend les lignes, prix, TVA, remise et notes client. Les notes personnelles restent exclues.</span></div></div>
                <div className="rm-commercial-form"><label>Destinataire<input type="email" value={email.recipient} onChange={(event) => setEmail({ ...email, recipient: event.target.value })} /></label><label>Objet<input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} /></label><label>Message<textarea rows={8} value={email.message} onChange={(event) => setEmail({ ...email, message: event.target.value })} /></label><label className="rm-commercial-check"><input type="checkbox" checked={email.withoutPrices} onChange={(event) => setEmail({ ...email, withoutPrices: event.target.checked })} /><span>Joindre la version chantier sans prix</span></label></div><div className="rm-email-security"><ShieldCheck size={18} /><span>Pièce jointe générée au moment de l’envoi avec les dernières informations enregistrées.</span></div><footer className="rm-commercial-footer"><button className="secondary" type="button" onClick={() => { setOverlay(null); setEmail(null); }}>Annuler</button><button className="primary" type="button" onClick={() => void sendEmail()} disabled={emailBusy}><Send size={18} /> {emailBusy ? "Envoi…" : "Envoyer avec le PDF"}</button></footer>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && <div className="rm-commercial-toast" role="status"><CheckCircle2 size={18} /> {toast}</div>}
    </>
  );
}
