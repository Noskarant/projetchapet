"use client";

import { CollaboratorPanel, SupplierPanel, InboundEmailPanel } from "./artisan-workflow-panels";
import { FIELD_INTERFACE_QUERY } from "@/lib/responsive-interface";

import { CheckCircle2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMMERCIAL_CLOUD_MIGRATION_KEY,
  COMMERCIAL_FAILED_PUSH_RETRY_MS,
  COMMERCIAL_PULL_INTERVAL_MS,
  commercialCloudSignature,
  applyCommercialSyncResult,
  fetchCommercialCloudState,
  isCommercialCloudConflict,
  mergeConcurrentCommercialState,
  mergeInitialCommercialState,
  saveCommercialCloudState,
  type CommercialCloudSnapshot,
} from "@/lib/commercial-cloud";
import { blobToBase64 } from "@/lib/document-tools";
import { sendAuthenticatedDocumentEmail } from "@/lib/authenticated-email";
import { plainDocumentEmailHtml } from '@/lib/document-email-template';
import {
  COMMERCIAL_DEMO_STORAGE_KEY,
  appendActivity,
  buildCommercialNotifications,
  exportCommercialBackup,
  filterBusinessDocuments,
  findBusinessDocument,
  findCustomer,
  importCommercialBackup,
  readCommercialDemoState,
  seedCommercialDemoState,
  writeCommercialDemoState,
  type CommercialCompanySettings,
  type CommercialDemoState,
  type CommercialNotification,
  type DemoDocumentKind,
  type DocumentFilters,
} from "@/lib/mobile-commercial-demo";
import {
  buildBusinessDocumentPdf,
  documentFileName,
  isMobileQuote,
} from "@/lib/mobile-document-pdf";
import {
  parseMobileWorkspace,
  readQuoteInternalMeta,
} from "@/lib/mobile-quote-preview";
import type { CommercialProject } from "@/lib/mobile-commercial-demo";
import { buildProjectPhotoReport } from "@/lib/project-photo-report";
import { sendProjectPhotoEmail } from "@/lib/project-photo-email";
import { ensureQuotePhotoProject, projectsForQuote, quotePhotoDossier } from '@/lib/quote-photo-dossier';
import type { MobileWorkspace } from "@/lib/mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";
import MobileCommercialProjects from "./mobile-commercial-projects";
import {
  ActivityPanel,
  BackupPanel,
  EmailPanel,
  FilterPanel,
  NotificationsPanel,
  SettingsPanel,
  type EmailDraft,
} from "./mobile-commercial-panels";

type Overlay =
  | "team"
  | "suppliers"
  | "inbound"
  | "filters"
  | "notifications"
  | "projects"
  | "activity"
  | "backup"
  | "settings"
  | "email"
  | null;

const COMMERCIAL_LOCAL_CHECK_MS = 850;
const COMMERCIAL_CLOUD_ENABLED = process.env.NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED !== "0";

const emptyFilters = (): DocumentFilters => ({
  customerId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
});

const normalizeText = (value: string) =>
  value.trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");

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

function overlayTitle(overlay: Overlay) {
  if (overlay === "team") return "Collaborateurs";
  if (overlay === "suppliers") return "Fournisseurs";
  if (overlay === "inbound") return "E-mail → chantier";
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
  const [commercialLoaded, setCommercialLoaded] = useState(false);
  const [filterKind, setFilterKind] = useState<DemoDocumentKind>("quote");
  const [filterDraft, setFilterDraft] = useState<DocumentFilters>(() => emptyFilters());
  const [selectedProjectId, setSelectedProjectId] = useState("PROJECT-BELLEVUE");
  const [projectInitialTab,setProjectInitialTab]=useState<'suivi'|'photos'>('suivi');
  const [smsConfigured,setSmsConfigured]=useState(false);
  const [companyDraft, setCompanyDraft] = useState<CommercialCompanySettings>(() => seedCommercialDemoState().company);
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  const workspaceSnapshot = useRef("");
  const commercialBaseline = useRef<CommercialCloudSnapshot | null>(null);
  const commercialSyncing = useRef(false);
  const commercialFailedSignature = useRef("");
  const commercialFailedAt = useRef(0);
  const commercialLastPull = useRef(0);

  useEffect(()=>{fetch('/api/email').then(r=>r.json()).then(result=>setSmsConfigured(result.smsConfigured===true)).catch(()=>{});},[]);


  useEffect(() => {
    const open = (event: Event) => {
      const panel = (event as CustomEvent).detail;
      if (["team", "suppliers", "inbound"].includes(panel)) setOverlay(panel);
    };
    window.addEventListener("manufeo:open-workflow-panel", open);
    return () => window.removeEventListener("manufeo:open-workflow-panel", open);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2_700);
  }, []);

  const openQuotePhotos=useCallback((number:string)=>{
    const currentWorkspace=readWorkspace();const quote=currentWorkspace?.quotes.find(item=>item.number===number);
    if(!quote||!currentWorkspace){notify('Devis introuvable.');return;}
    setWorkspace(currentWorkspace);
    const result=ensureQuotePhotoProject(readCommercialDemoState(window.localStorage),quote,findCustomer(currentWorkspace,quote.customerId));
    writeCommercialDemoState(window.localStorage,result.state);setCommercial(result.state);
    setSelectedProjectId(result.project.id);setProjectInitialTab('photos');setOverlay('projects');
  },[notify]);
  useEffect(()=>{const handler=(event:Event)=>openQuotePhotos((event as CustomEvent<string>).detail);window.addEventListener('manufeo:open-quote-photos',handler);return()=>window.removeEventListener('manufeo:open-quote-photos',handler);},[openQuotePhotos]);

  const refreshWorkspace = useCallback(() => {
    const raw = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) || "";
    if (!raw || raw === workspaceSnapshot.current) return;
    const next = parseMobileWorkspace(raw);
    if (next) {
      workspaceSnapshot.current = raw;
      setWorkspace(next);
    }
  }, []);

  useEffect(()=>{
    const reveal=(event:Event)=>{
      const kind=(event as CustomEvent<string>).detail;
      if(kind==='quote'||kind==='invoice')setCommercial(current=>({...current,filters:{...current.filters,[kind]:emptyFilters()}}));
    };
    window.addEventListener('manufeo:local-workspace-updated',refreshWorkspace);
    window.addEventListener('storage',refreshWorkspace);
    window.addEventListener('manufeo:reveal-document',reveal);
    return()=>{window.removeEventListener('manufeo:local-workspace-updated',refreshWorkspace);window.removeEventListener('storage',refreshWorkspace);window.removeEventListener('manufeo:reveal-document',reveal);};
  },[refreshWorkspace]);

  const logActivity = useCallback((event: Parameters<typeof appendActivity>[1]) => {
    setCommercial((current) => appendActivity(current, event));
  }, []);

  useEffect(() => {
    const refresh = () => setCommercial(readCommercialDemoState(window.localStorage));
    window.addEventListener("manufeo:quote-photo-relations-updated", refresh);
    return () => window.removeEventListener("manufeo:quote-photo-relations-updated", refresh);
  }, []);

  useEffect(() => {
    if (!window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;
    let disposed = false;
    const initial = readCommercialDemoState(window.localStorage);
    setCommercial(initial);
    setCompanyDraft(initial.company);
    setCommercialLoaded(true);
    refreshWorkspace();

    if (!COMMERCIAL_CLOUD_ENABLED) return;

    const hydrateCloud = async () => {
      try {
        let server = await fetchCommercialCloudState(initial);
        if (disposed) return;
        const migratedOrganization = window.localStorage.getItem(COMMERCIAL_CLOUD_MIGRATION_KEY);

        if (migratedOrganization !== server.organizationId) {
          const merged = mergeInitialCommercialState(server.state, initial);
          if (commercialCloudSignature(merged) !== commercialCloudSignature(server.state)) {
            try {
              await saveCommercialCloudState(merged, server.revision);
            } catch (error) {
              if (!isCommercialCloudConflict(error)) throw error;
              const latest = await fetchCommercialCloudState(initial);
              const rebased = mergeConcurrentCommercialState(server.state, merged, latest.state);
              await saveCommercialCloudState(rebased, latest.revision);
            }
          }
          const latestLocal = readCommercialDemoState(window.localStorage);
          server = await fetchCommercialCloudState(latestLocal);
          window.localStorage.setItem(COMMERCIAL_CLOUD_MIGRATION_KEY, server.organizationId);
        }

        if (disposed) return;
        commercialBaseline.current = server;
        commercialLastPull.current = Date.now();
        writeCommercialDemoState(window.localStorage, server.state);
        setCommercial(server.state);
        setCompanyDraft(server.state.company);
      } catch (error) {
        console.error("[FORGEO] Hydratation des chantiers cloud impossible, conservation locale", error);
      }
    };

    void hydrateCloud();
    return () => {
      disposed = true;
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!commercialLoaded || !window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;
    writeCommercialDemoState(window.localStorage, commercial);
    document.documentElement.dataset.chapetAccent = commercial.company.accent;
  }, [commercial, commercialLoaded]);

  useEffect(() => {
    if (
      !COMMERCIAL_CLOUD_ENABLED ||
      !commercialLoaded ||
      !window.matchMedia(FIELD_INTERFACE_QUERY).matches
    ) return;
    let disposed = false;

    const synchronizeCommercialCloud = async () => {
      const baseline = commercialBaseline.current;
      if (!baseline || disposed || commercialSyncing.current) return;

      const local = readCommercialDemoState(window.localStorage);
      const localSignature = commercialCloudSignature(local);
      const baselineSignature = commercialCloudSignature(baseline.state);
      const localChanged = localSignature !== baselineSignature;
      const pullDue = Date.now() - commercialLastPull.current >= COMMERCIAL_PULL_INTERVAL_MS;

      if (!localChanged && !pullDue) return;
      if (
        localChanged &&
        localSignature === commercialFailedSignature.current &&
        Date.now() - commercialFailedAt.current < COMMERCIAL_FAILED_PUSH_RETRY_MS
      ) return;

      commercialSyncing.current = true;
      try {
        let next: CommercialCloudSnapshot;
        if (localChanged) {
          try {
            next = await saveCommercialCloudState(local, baseline.revision);
          } catch (error) {
            if (!isCommercialCloudConflict(error)) throw error;
            const server = await fetchCommercialCloudState(local);
            const merged = mergeConcurrentCommercialState(baseline.state, local, server.state);
            next = await saveCommercialCloudState(merged, server.revision);
          }
        } else {
          next = await fetchCommercialCloudState(local);
        }

        if (disposed) return;
        const currentLocal = readCommercialDemoState(window.localStorage);
        const appliedState = applyCommercialSyncResult(local, currentLocal, next.state);
        const shouldApplyServer =
          localChanged || commercialCloudSignature(appliedState) !== commercialCloudSignature(currentLocal);
        if (shouldApplyServer) {
          writeCommercialDemoState(window.localStorage, appliedState);
          setCommercial(appliedState);
        }
        commercialBaseline.current = next;
        commercialLastPull.current = Date.now();
        commercialFailedSignature.current = "";
        commercialFailedAt.current = 0;
      } catch (error) {
        console.error("[FORGEO] Synchronisation des chantiers cloud impossible", error);
        if (localChanged) {
          commercialFailedSignature.current = localSignature;
          commercialFailedAt.current = Date.now();
        }
      } finally {
        commercialSyncing.current = false;
      }
    };

    const interval = window.setInterval(
      () => void synchronizeCommercialCloud(),
      COMMERCIAL_LOCAL_CHECK_MS,
    );
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [commercialLoaded]);

  const notifications = useMemo(
    () => workspace ? buildCommercialNotifications(workspace, commercial) : [],
    [commercial, workspace],
  );

  useEffect(() => {
    const decorate = () => {
      const button = document.querySelector<HTMLButtonElement>('.rm-header-actions button[aria-label="Notifications"]');
      if (!button) return;
      const count = notifications.filter(item => item.id !== "all-clear").length;
      button.classList.toggle("rm-has-notifications", count > 0);
      button.title = count > 0 ? `${count} notification(s)` : "Aucune nouvelle notification";
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [notifications]);

  const activeFilterCount = useCallback(
    (kind: DemoDocumentKind) => Object.values(commercial.filters[kind]).filter(Boolean).length,
    [commercial.filters],
  );

  const applyDomFilters = useCallback(() => {
    if (!workspace) return;
    const search = document.querySelector<HTMLInputElement>(".rm-search input");
    if (!search) return;

    const kind: DemoDocumentKind = normalizeText(search.placeholder).includes("facture")
      ? "invoice"
      : "quote";
    const documents = kind === "quote" ? workspace.quotes : workspace.invoices;
    const allowedNumbers = new Set(
      filterBusinessDocuments(documents, commercial.filters[kind]).map((item) => item.number),
    );

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".rm-document-card"));
    let visibleCount = 0;
    cards.forEach((card) => {
      const number = card.querySelector(".rm-document-main small")?.textContent?.trim() || "";
      const hidden = !allowedNumbers.has(number);
      card.classList.toggle("rm-commercial-hidden", hidden);
      if (!hidden) visibleCount += 1;
    });

    const section = search.closest(".rm-section");
    const list = section?.querySelector<HTMLElement>(".rm-list");
    const existingEmpty = section?.querySelector<HTMLElement>(".rm-commercial-empty");
    if (list && visibleCount === 0) {
      if (!existingEmpty) {
        const empty = document.createElement("div");
        empty.className = "rm-commercial-empty";
        empty.innerHTML = "<strong>Aucun document ne correspond</strong><span>Modifiez ou réinitialisez les filtres.</span>";
        list.insertAdjacentElement("afterend", empty);
      }
    } else {
      existingEmpty?.remove();
    }

    const trigger = section?.querySelector<HTMLElement>(
      `.rm-commercial-filter-trigger[data-kind="${kind}"]`,
    );
    const badge = trigger?.querySelector<HTMLElement>("b");
    const count = activeFilterCount(kind);
    if (badge) {
      const nextText = String(count);
      if (badge.textContent !== nextText) badge.textContent = nextText;
      const shouldHide = count === 0;
      if (badge.hidden !== shouldHide) badge.hidden = shouldHide;
    }
  }, [activeFilterCount, commercial.filters, workspace]);

  const enhanceDom = useCallback(() => {
    const search = document.querySelector<HTMLInputElement>(".rm-search input");
    if (search) {
      const kind: DemoDocumentKind = normalizeText(search.placeholder).includes("facture")
        ? "invoice"
        : "quote";
      const container = search.closest<HTMLElement>(".rm-search");
      if (container && !container.querySelector(".rm-commercial-filter-trigger")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rm-commercial-filter-trigger";
        button.dataset.kind = kind;
        button.dataset.commercialAction = "filters";
        button.setAttribute(
          "aria-label",
          kind === "quote" ? "Filtrer les devis" : "Filtrer les factures",
        );
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

    const detailActions = document.querySelector<HTMLElement>(".rm-detail-actions");
    if (detailActions && !detailActions.querySelector("[data-commercial-action='activity']")) {
      const historyButton = document.createElement("button");
      historyButton.type = "button";
      historyButton.dataset.commercialAction = "activity";
      historyButton.innerHTML = "<span aria-hidden='true'>◷</span> Historique";
      detailActions.appendChild(historyButton);
    }

    applyDomFilters();
  }, [applyDomFilters]);

  const openEmailFromButton = useCallback((button: HTMLButtonElement) => {
    const number = button.closest(".rm-detail-sheet")?.querySelector("h2")?.textContent?.trim() || "";
    const currentWorkspace = readWorkspace();
    const found = currentWorkspace ? findBusinessDocument(currentWorkspace, number) : null;
    if (!found || !currentWorkspace) {
      notify("Document introuvable.");
      return;
    }

    const customer = findCustomer(currentWorkspace, found.document.customerId);
    const documentLabel = isMobileQuote(found.document) ? "devis" : "facture";
    workspaceSnapshot.current = window.localStorage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) || "";
    setWorkspace(currentWorkspace);
    setEmail({
      document: found.document,
      recipient: customer?.emails.find(Boolean) || "",
      subject: `${isMobileQuote(found.document) ? "Votre devis" : "Votre facture"} ${found.document.number}`,
      message: `Bonjour,\n\nVeuillez trouver votre ${documentLabel} ${found.document.number} en pièce jointe.\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${commercial.company.displayName}`,
      withoutPrices: false,
      copyToSelf: true,
    });
    setOverlay("email");
  }, [commercial.company.displayName, notify]);

  useEffect(() => {
    if (!window.matchMedia(FIELD_INTERFACE_QUERY).matches) return;

    let refreshTimer: number | null = null;
    const observer = new MutationObserver(() => {
      enhanceDom();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshWorkspace, 40);
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
        const kind: DemoDocumentKind = button.dataset.kind === "invoice" ? "invoice" : "quote";
        setFilterKind(kind);
        setFilterDraft({ ...commercial.filters[kind] });
        setOverlay("filters");
        return;
      }

      if (action === "activity" || action === "backup") {
        event.preventDefault();
        event.stopPropagation();
        setOverlay(action);
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
        setOverlay("projects");
        window.setTimeout(
          () => document.querySelector<HTMLButtonElement>(".rm-side-drawer header button")?.click(),
          0,
        );
        return;
      }

      if (text.includes("modifier les informations") || text.includes("ouvrir tous les paramètres")) {
        event.preventDefault();
        event.stopPropagation();
        setCompanyDraft(commercial.company);
        setOverlay("settings");
        window.setTimeout(
          () => document.querySelector<HTMLButtonElement>(".rm-side-drawer header button")?.click(),
          0,
        );
        return;
      }

      if (text === "envoyer pdf") {
        event.preventDefault();
        event.stopPropagation();
        openEmailFromButton(button);
        return;
      }

      if (button.closest(".rm-status-editor")) {
        const number = button.closest(".rm-detail-sheet")?.querySelector("h2")?.textContent?.trim();
        const status = button.textContent?.trim() || "Statut";
        window.setTimeout(() => {
          logActivity({
            kind: "status",
            message: `${number || "Document"} passé au statut « ${status} ».`,
            documentNumber: number,
          });
          workspaceSnapshot.current = "";
          refreshWorkspace();
        }, 80);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      document.removeEventListener("click", onClick, true);
    };
  }, [commercial.company, commercial.filters, enhanceDom, logActivity, openEmailFromButton, refreshWorkspace]);

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

  const openNotification = (notification: CommercialNotification) => {
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
    }, 140);
  };

  const downloadProjectDocument = async (projectId: string, withoutPrices: boolean) => {
    const currentWorkspace = workspace ?? readWorkspace();
    const project = commercial.projects.find((item) => item.id === projectId);
    if (!currentWorkspace || !project) return;

    const documentData = project.quoteId
      ? currentWorkspace.quotes.find((quote) => quote.id === project.quoteId)
      : project.invoiceId
        ? currentWorkspace.invoices.find((invoice) => invoice.id === project.invoiceId)
        : null;
    if (!documentData) {
      notify("Aucun document lié à ce chantier.");
      return;
    }

    const customer = findCustomer(currentWorkspace, documentData.customerId);
    const quoteMeta = isMobileQuote(documentData)
      ? readQuoteInternalMeta(window.localStorage, documentData.number)
      : undefined;
    const blob = await buildBusinessDocumentPdf({
      document: documentData,
      customer,
      company: commercial.company,
      quoteMeta,
      withoutPrices,
    });
    downloadBlob(blob, documentFileName(documentData, withoutPrices));
    logActivity({
      kind: "document",
      message: `${documentData.number} téléchargé${withoutPrices ? " sans prix pour l’équipe" : ""}.`,
      documentNumber: documentData.number,
      projectId,
    });
  };

  const sendPhotoReport = async (project: CommercialProject, ids: string[], recipient: string) => {
    const currentWorkspace = readWorkspace();
    const customer = currentWorkspace ? findCustomer(currentWorkspace, project.customerId) : null;
    const selected = project.photos.filter(photo => ids.includes(photo.id));
    const fingerprint = JSON.stringify({ project: { id: project.id, name: project.name, address: project.address }, to: recipient.trim().toLowerCase(), photos: selected.map(photo => ({ id: photo.id, caption: photo.caption, createdAt: photo.createdAt })), company: commercial.company.displayName, customer: customer ? [customer.companyName, customer.lastName, customer.firstName].filter(Boolean).join(' ') : '' });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    const requestId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const blob = await buildProjectPhotoReport(project, ids, commercial.company.displayName, customer ? [customer.companyName, customer.lastName, customer.firstName].filter(Boolean).join(' ') : '', requestId);
    await sendProjectPhotoEmail(project.id, ids, recipient, await blobToBase64(blob), requestId);
    logActivity({ kind: 'email', message: `${project.name} · dossier de ${ids.length} photo(s) envoyé à ${recipient}.`, projectId: project.id });
  };

  const sendEmail = async () => {
    if (emailBusy) return;
    if (!email || !email.recipient.trim()) {
      notify("Renseignez l’adresse e-mail du destinataire.");
      return;
    }
    const currentWorkspace = workspace ?? readWorkspace();
    if (!currentWorkspace) {
      notify("Espace de travail indisponible.");
      return;
    }

    const customer = findCustomer(currentWorkspace, email.document.customerId);
    if (!email.withoutPrices && email.document.items.some(item => item.quantity === null || item.unitPrice === null || item.taxRate === null)) {
      notify('Complétez les quantités et tarifs avant d’envoyer le document avec les prix.');
      return;
    }
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
      const attachments=[{filename:documentFileName(email.document,email.withoutPrices),content:await blobToBase64(blob)}];
      if(isMobileQuote(email.document)){
        const dossier=quotePhotoDossier(commercial,email.document,email.photoIds);
        if(dossier){const photoPdf=await buildProjectPhotoReport(dossier,dossier.photos.map(photo=>photo.id),commercial.company.displayName,email.document.customerName,crypto.randomUUID().replaceAll('-',''));
          attachments.push({filename:`dossier-photos-${email.document.number}.pdf`,content:await blobToBase64(photoPdf)});}
      }
      const response=await sendAuthenticatedDocumentEmail({
        documentNumber: email.document.number,
        documentKind: isMobileQuote(email.document) ? 'quote' : 'invoice',
        to: email.recipient.trim(),
        customRecipient: true,
        copyToSelf: email.copyToSelf ?? true,
        requestSignature: !email.withoutPrices && Boolean(email.requestSignature),
        notifyBySms: !email.withoutPrices && Boolean(email.notifyBySms),
        subject: email.subject,
        html: plainDocumentEmailHtml(email.message),
        attachments,
      });
      const sent=await response.json().catch(()=>({}));
      const sms=sent.sms;
      notify(`Document envoyé à ${email.recipient}.${sms?.status==='queued'?' Notification SMS prise en charge.':sms?.status==='unavailable'?' SMS indisponible : vérifiez le téléphone et l’e-mail du client.':sms?.status==='uncertain'?' Envoi SMS non confirmé ; ne le renvoyez pas tout de suite.':''}`);
      logActivity({
        kind: "email",
        message: `${email.document.number} envoyé à ${email.recipient}.`,
        documentNumber: email.document.number,
      });

      setEmail(null);
      setOverlay(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setEmailBusy(false);
    }
  };

  useEffect(() => {
    const openQuoteEmail = (event: Event) => {
      const { number, withoutPrices } = (event as CustomEvent<{ number: string; withoutPrices: boolean }>).detail || {};
      const currentWorkspace = readWorkspace();
      const quote = currentWorkspace?.quotes.find((item) => item.number === number);
      const customer = quote && currentWorkspace ? findCustomer(currentWorkspace, quote.customerId) : null;
      if (!quote || !currentWorkspace) { notify('Document introuvable.'); return; }
      if (emailBusy) return;
      setWorkspace(currentWorkspace);
      setToast('');
      setEmail({ document: quote, recipient: customer?.emails.find(Boolean)?.trim() || '',
        subject: `Votre devis ${quote.number}`,
        message: `Bonjour,\n\nVeuillez trouver votre devis ${quote.number} en pièce jointe.\n\nCordialement,\n${commercial.company.displayName}`,
        withoutPrices: Boolean(withoutPrices), copyToSelf: true,
        requestSignature: !withoutPrices && quote.status==='En attente' && Boolean(customer?.emails.find(Boolean)), notifyBySms: !withoutPrices && Boolean(customer?.phones.find(Boolean)) });
      setOverlay('email');
    };
    window.addEventListener("manufeo:send-quote", openQuoteEmail);
    return () => window.removeEventListener("manufeo:send-quote", openQuoteEmail);
  }, [commercial.company, emailBusy, notify]);

  const saveCompany = () => {
    const company = {
      ...companyDraft,
      quoteValidityDays: Math.max(1, Number(companyDraft.quoteValidityDays) || 60),
    };
    setCommercial((current) =>
      appendActivity(
        { ...current, company },
        { kind: "settings", message: "Informations de l’entreprise mises à jour." },
      ),
    );
    setOverlay(null);
    notify("Réglages enregistrés.");
  };

  const exportBackup = () => {
    try {
      const content = exportCommercialBackup(window.localStorage);
      downloadText(
        content,
        `projet-chapet-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
      );
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

  if (!overlay && !toast) return null;

  return (
    <>
      {overlay && (
        <div
          className={`rm-commercial-backdrop${overlay === 'email' ? ' rm-document-email-backdrop' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={overlay === 'email' && email ? `Envoyer ${isMobileQuote(email.document) ? 'le devis' : 'la facture'}` : overlayTitle(overlay)}
        >
          <section className={`rm-commercial-panel rm-commercial-${overlay}`}>
            <header className="rm-commercial-header">
              <button
                type="button"
                disabled={overlay === 'email' && emailBusy}
                onClick={() => {
                  if(overlay==='projects'&&email){setOverlay('email');return;}
                  setOverlay(null);
                  setEmail(null);
                }}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
              <div>
                <small>{overlay === 'email' ? commercial.company.displayName : 'PROJET CHAPET'}</small>
                <h2>{overlay === 'email' && email ? `Envoyer ${isMobileQuote(email.document) ? 'le devis' : 'la facture'}` : overlayTitle(overlay)}</h2>
              </div>
              {overlay !== 'email' && <span className="rm-commercial-live"><i /> Démo locale</span>}
            </header>

            {overlay === "filters" && (
              <FilterPanel
                workspace={workspace}
                kind={filterKind}
                draft={filterDraft}
                onChange={setFilterDraft}
                onApply={saveFilters}
                onReset={resetFilters}
              />
            )}

            {overlay === "team" && <CollaboratorPanel state={commercial} onChange={setCommercial} onNotify={notify} />}
            {overlay === "suppliers" && <SupplierPanel onNotify={notify} />}
            {overlay === "inbound" && <InboundEmailPanel onNotify={notify} />}
            {overlay === "notifications" && (
              <NotificationsPanel notifications={notifications} onOpen={openNotification} />
            )}

            {overlay === "activity" && <ActivityPanel activity={commercial.activity} />}

            {overlay === "projects" && (
              <MobileCommercialProjects
                initialTab={projectInitialTab}
                state={commercial}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onChange={next => { writeCommercialDemoState(window.localStorage, next); setCommercial(next); }}
                customerEmail={workspace ? findCustomer(workspace, commercial.projects.find(item => item.id === selectedProjectId)?.customerId ?? commercial.projects[0]?.customerId ?? "")?.emails.find(Boolean) || "" : ""}
                onSendPhotoReport={sendPhotoReport}
                onNotify={notify}
                onCreateQuote={(customerId, title) => {
                  setOverlay(null);
                  window.setTimeout(() => window.dispatchEvent(new CustomEvent("manufeo:create-project-quote", { detail: { customerId, title } })), 0);
                }}
                onDownloadDocument={(projectId, withoutPrices) =>
                  void downloadProjectDocument(projectId, withoutPrices)
                }
              />
            )}

            {overlay === "backup" && (
              <BackupPanel
                onExport={exportBackup}
                onImport={(file) => void importBackup(file)}
                onReset={resetDemo}
              />
            )}

            {overlay === "settings" && (
              <SettingsPanel
                draft={companyDraft}
                onChange={setCompanyDraft}
                onSave={saveCompany}
                onCancel={() => setOverlay(null)}
              />
            )}

            {overlay === "email" && email && (
              <EmailPanel
                draft={email}
                busy={emailBusy}
                message={toast}
                onChange={setEmail}
                onSend={() => void sendEmail()}
                photos={isMobileQuote(email.document)?projectsForQuote(commercial,email.document.id).flatMap(project=>project.photos):[]}
                onManagePhotos={isMobileQuote(email.document)?()=>openQuotePhotos(email.document.number):undefined}
                smsConfigured={smsConfigured}
                onCancel={() => {
                  setEmail(null);
                  setOverlay(null);
                }}
              />
            )}
          </section>
        </div>
      )}

      {toast && overlay !== 'email' && (
        <div className="rm-commercial-toast" role="status">
          <CheckCircle2 size={18} /> {toast}
        </div>
      )}
    </>
  );
}
