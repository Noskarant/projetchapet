"use client";

import { CheckCircle2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobToBase64 } from "@/lib/document-tools";
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
  type MobileBusinessDocument,
} from "@/lib/mobile-document-pdf";
import {
  parseMobileWorkspace,
  readQuoteInternalMeta,
} from "@/lib/mobile-quote-preview";
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
  | "filters"
  | "notifications"
  | "projects"
  | "activity"
  | "backup"
  | "settings"
  | "email"
  | null;

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
  const [companyDraft, setCompanyDraft] = useState<CommercialCompanySettings>(() => seedCommercialDemoState().company);
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
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

  const logActivity = useCallback((event: Parameters<typeof appendActivity>[1]) => {
    setCommercial((current) => appendActivity(current, event));
  }, []);

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

  const notifications = useMemo(
    () => workspace ? buildCommercialNotifications(workspace, commercial) : [],
    [commercial, workspace],
  );

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
      badge.textContent = String(count);
      badge.hidden = count === 0;
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
          refreshWorkspace();
        }, 80);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, [commercial.company, commercial.filters, enhanceDom, logActivity, refreshWorkspace]);

  useEffect(() => {
    applyDomFilters();
  }, [applyDomFilters]);

  const openEmailFromButton = (button: HTMLButtonElement) => {
    const number = button.closest(".rm-detail-sheet")?.querySelector("h2")?.textContent?.trim() || "";
    const currentWorkspace = readWorkspace();
    const found = currentWorkspace ? findBusinessDocument(currentWorkspace, number) : null;
    if (!found || !currentWorkspace) {
      notify("Document introuvable.");
      return;
    }

    const customer = findCustomer(currentWorkspace, found.document.customerId);
    const documentLabel = isMobileQuote(found.document) ? "devis" : "facture";
    setWorkspace(currentWorkspace);
    setEmail({
      document: found.document,
      recipient: customer?.emails.find(Boolean) || "",
      subject: `${isMobileQuote(found.document) ? "Votre devis" : "Votre facture"} ${found.document.number}`,
      message: `Bonjour,\n\nVeuillez trouver votre ${documentLabel} ${found.document.number} en pièce jointe.\n\nJe reste à votre disposition pour toute question.\n\nCordialement,\n${commercial.company.displayName}`,
      withoutPrices: false,
    });
    setOverlay("email");
  };

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

    const document = project.quoteId
      ? currentWorkspace.quotes.find((quote) => quote.id === project.quoteId)
      : project.invoiceId
        ? currentWorkspace.invoices.find((invoice) => invoice.id === project.invoiceId)
        : null;
    if (!document) {
      notify("Aucun document lié à ce chantier.");
      return;
    }

    const customer = findCustomer(currentWorkspace, document.customerId);
    const quoteMeta = isMobileQuote(document)
      ? readQuoteInternalMeta(window.localStorage, document.number)
      : undefined;
    const blob = await buildBusinessDocumentPdf({
      document,
      customer,
      company: commercial.company,
      quoteMeta,
      withoutPrices,
    });
    downloadBlob(blob, documentFileName(document, withoutPrices));
    logActivity({
      kind: "document",
      message: `${document.number} téléchargé${withoutPrices ? " sans prix pour l’équipe" : ""}.`,
      documentNumber: document.number,
      projectId,
    });
  };

  const sendEmail = async () => {
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
          attachments: [
            {
              filename: documentFileName(email.document, email.withoutPrices),
              content: await blobToBase64(blob),
            },
          ],
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
      setEmail(null);
      setOverlay(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setEmailBusy(false);
    }
  };

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
          className="rm-commercial-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={overlayTitle(overlay)}
        >
          <section className={`rm-commercial-panel rm-commercial-${overlay}`}>
            <header className="rm-commercial-header">
              <button
                type="button"
                onClick={() => {
                  setOverlay(null);
                  setEmail(null);
                }}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
              <div>
                <small>PROJET CHAPET</small>
                <h2>{overlayTitle(overlay)}</h2>
              </div>
              <span className="rm-commercial-live"><i /> Démo locale</span>
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

            {overlay === "notifications" && (
              <NotificationsPanel notifications={notifications} onOpen={openNotification} />
            )}

            {overlay === "activity" && <ActivityPanel activity={commercial.activity} />}

            {overlay === "projects" && (
              <MobileCommercialProjects
                state={commercial}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onChange={setCommercial}
                onNotify={notify}
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
                onChange={setEmail}
                onSend={() => void sendEmail()}
                onCancel={() => {
                  setEmail(null);
                  setOverlay(null);
                }}
              />
            )}
          </section>
        </div>
      )}

      {toast && (
        <div className="rm-commercial-toast" role="status">
          <CheckCircle2 size={18} /> {toast}
        </div>
      )}
    </>
  );
}
