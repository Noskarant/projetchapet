import type {
  InvoiceStatus,
  MobileAgendaEntry,
  MobileCustomer,
  MobileInvoice,
  MobileQuote,
  MobileWorkspace,
  QuoteStatus,
} from "./mobile-prototype";
import { QUOTE_META_STORAGE_KEY } from "./mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "./mobile-workspace-storage";

export const COMMERCIAL_DEMO_STORAGE_KEY = "projetchapet-commercial-demo-v1";
export const COMMERCIAL_BACKUP_VERSION = 1;

export type DemoDocumentKind = "quote" | "invoice";
export type ProjectStatus = "À planifier" | "En cours" | "Bloqué" | "Terminé";
export type ProjectTab = "suivi" | "equipe" | "photos" | "documents";
export type ActivityKind =
  | "document"
  | "status"
  | "chantier"
  | "email"
  | "data"
  | "settings";

export type DocumentFilters = {
  customerId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
};

export type CommercialCompanySettings = {
  legalName: string;
  displayName: string;
  siret: string;
  vat: string;
  email: string;
  accountingEmail: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  quoteValidityDays: number;
  paymentTerms: string;
  accent: "blue" | "indigo" | "emerald";
};

export type CommercialCollaborator = {
  id: string;
  name: string;
  role: string;
  phone: string;
  initials: string;
  active: boolean;
};

export type CommercialProjectStep = {
  id: string;
  label: string;
  assigneeId: string;
  dueDate: string;
  done: boolean;
};

export type CommercialProjectIssue = {
  id: string;
  title: string;
  detail: string;
  severity: "Information" | "À surveiller" | "Bloquant";
  resolved: boolean;
  createdAt: string;
};

export type CommercialProjectPhoto = {
  id: string;
  name: string;
  caption: string;
  createdAt: string;
  dataUrl?: string;
};

export type CommercialProject = {
  id: string;
  name: string;
  subtitle: string;
  customerId: string;
  quoteId?: string;
  invoiceId?: string;
  address: string;
  status: ProjectStatus;
  startDate: string;
  nextVisit: string;
  teamIds: string[];
  steps: CommercialProjectStep[];
  issues: CommercialProjectIssue[];
  photos: CommercialProjectPhoto[];
};

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  message: string;
  createdAt: string;
  documentNumber?: string;
  projectId?: string;
};

export type CommercialDemoState = {
  company: CommercialCompanySettings;
  collaborators: CommercialCollaborator[];
  projects: CommercialProject[];
  activity: ActivityEvent[];
  filters: Record<DemoDocumentKind, DocumentFilters>;
};

export type CommercialNotification = {
  id: string;
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  detail: string;
  documentKind?: DemoDocumentKind;
  documentNumber?: string;
  projectId?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type AnyDocument = MobileQuote | MobileInvoice;

type CommercialBackup = {
  version: number;
  exportedAt: string;
  workspace: MobileWorkspace;
  quoteMeta: unknown;
  commercial: CommercialDemoState;
};

const emptyFilters = (): DocumentFilters => ({
  customerId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  minAmount: "",
  maxAmount: "",
});

const isoDate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const nowIso = () => new Date().toISOString();

export function seedCommercialDemoState(): CommercialDemoState {
  const collaborators: CommercialCollaborator[] = [
    {
      id: "COL-01",
      name: "Philippe Chapet",
      role: "Dirigeant · suivi client",
      phone: "06 81 20 14 88",
      initials: "PC",
      active: true,
    },
    {
      id: "COL-02",
      name: "Lucas Martin",
      role: "Chef d’équipe peinture",
      phone: "06 43 18 72 10",
      initials: "LM",
      active: true,
    },
    {
      id: "COL-03",
      name: "Mathieu Roche",
      role: "Peintre façadier",
      phone: "06 14 77 32 08",
      initials: "MR",
      active: true,
    },
  ];

  const projects: CommercialProject[] = [
    {
      id: "PROJECT-BELLEVUE",
      name: "SCI Bellevue",
      subtitle: "Hall d’entrée · peinture murs et plafond",
      customerId: "C-002",
      quoteId: "Q-376",
      invoiceId: "I-018",
      address: "4 place du Monteil, 43120 Monistrol-sur-Loire",
      status: "En cours",
      startDate: isoDate(-4),
      nextVisit: isoDate(1),
      teamIds: ["COL-01", "COL-02", "COL-03"],
      steps: [
        { id: "STEP-B1", label: "Protection des sols et circulations", assigneeId: "COL-02", dueDate: isoDate(-3), done: true },
        { id: "STEP-B2", label: "Préparation et reprises des supports", assigneeId: "COL-03", dueDate: isoDate(-1), done: true },
        { id: "STEP-B3", label: "Première couche murs et plafond", assigneeId: "COL-02", dueDate: isoDate(1), done: false },
        { id: "STEP-B4", label: "Finitions, contrôle et réception", assigneeId: "COL-01", dueDate: isoDate(3), done: false },
      ],
      issues: [
        {
          id: "ISSUE-B1",
          title: "Microfissure au-dessus de la porte",
          detail: "À reprendre avant la couche de finition. Photo demandée après rebouchage.",
          severity: "À surveiller",
          resolved: false,
          createdAt: nowIso(),
        },
      ],
      photos: [],
    },
    {
      id: "PROJECT-DECHAUD",
      name: "Mme Dechaud",
      subtitle: "Séjour et couloir · remise en peinture",
      customerId: "C-003",
      quoteId: "Q-378",
      address: "8 rue des Lilas, 42230 Roche-la-Molière",
      status: "À planifier",
      startDate: isoDate(6),
      nextVisit: isoDate(6),
      teamIds: ["COL-01", "COL-03"],
      steps: [
        { id: "STEP-D1", label: "Validation des teintes avec la cliente", assigneeId: "COL-01", dueDate: isoDate(2), done: false },
        { id: "STEP-D2", label: "Préparation du matériel et protections", assigneeId: "COL-03", dueDate: isoDate(5), done: false },
        { id: "STEP-D3", label: "Réalisation et contrôle final", assigneeId: "COL-03", dueDate: isoDate(8), done: false },
      ],
      issues: [],
      photos: [],
    },
  ];

  return {
    company: {
      legalName: "CHAPET SAS",
      displayName: "CHAPET Père & Fils",
      siret: "879 214 563 00012",
      vat: "FR 12 879214563",
      email: "contact@saschapet.com",
      accountingEmail: "compta@saschapet.com",
      phone: "04 77 21 09 14",
      address: "18 rue Jean-Neyret",
      postalCode: "42000",
      city: "Saint-Étienne",
      quoteValidityDays: 60,
      paymentTerms: "Paiement à 30 jours. Aucun escompte pour règlement anticipé.",
      accent: "blue",
    },
    collaborators,
    projects,
    activity: [
      {
        id: "ACT-SEED-1",
        kind: "chantier",
        message: "Chantier SCI Bellevue préparé pour le suivi d’équipe.",
        createdAt: nowIso(),
        projectId: "PROJECT-BELLEVUE",
      },
      {
        id: "ACT-SEED-2",
        kind: "document",
        message: "Devis D-2026-378 prêt à être relancé.",
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        documentNumber: "D-2026-378",
      },
    ],
    filters: {
      quote: emptyFilters(),
      invoice: emptyFilters(),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCommercialDemoState(storage: Pick<Storage, "getItem">): CommercialDemoState {
  const fallback = seedCommercialDemoState();
  const raw = storage.getItem(COMMERCIAL_DEMO_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<CommercialDemoState>;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      company: { ...fallback.company, ...(isRecord(parsed.company) ? parsed.company : {}) },
      collaborators: Array.isArray(parsed.collaborators) ? parsed.collaborators as CommercialCollaborator[] : fallback.collaborators,
      projects: Array.isArray(parsed.projects) ? parsed.projects as CommercialProject[] : fallback.projects,
      activity: Array.isArray(parsed.activity) ? parsed.activity as ActivityEvent[] : fallback.activity,
      filters: {
        quote: { ...emptyFilters(), ...(parsed.filters?.quote ?? {}) },
        invoice: { ...emptyFilters(), ...(parsed.filters?.invoice ?? {}) },
      },
    };
  } catch {
    return fallback;
  }
}

export function writeCommercialDemoState(storage: Pick<Storage, "setItem">, state: CommercialDemoState) {
  storage.setItem(COMMERCIAL_DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function appendActivity(
  state: CommercialDemoState,
  event: Omit<ActivityEvent, "id" | "createdAt"> & Partial<Pick<ActivityEvent, "createdAt">>,
): CommercialDemoState {
  const next: ActivityEvent = {
    ...event,
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: event.createdAt ?? nowIso(),
  };
  return { ...state, activity: [next, ...state.activity].slice(0, 80) };
}

export function calculateProjectProgress(project: CommercialProject) {
  if (!project.steps.length) return 0;
  return Math.round((project.steps.filter((step) => step.done).length / project.steps.length) * 100);
}

export function toggleProjectStep(state: CommercialDemoState, projectId: string, stepId: string) {
  return {
    ...state,
    projects: state.projects.map((project) => project.id !== projectId ? project : {
      ...project,
      steps: project.steps.map((step) => step.id === stepId ? { ...step, done: !step.done } : step),
    }),
  };
}

export function setProjectIssueResolved(state: CommercialDemoState, projectId: string, issueId: string, resolved: boolean) {
  return {
    ...state,
    projects: state.projects.map((project) => project.id !== projectId ? project : {
      ...project,
      issues: project.issues.map((issue) => issue.id === issueId ? { ...issue, resolved } : issue),
    }),
  };
}

export function addProjectIssue(
  state: CommercialDemoState,
  projectId: string,
  issue: Pick<CommercialProjectIssue, "title" | "detail" | "severity">,
) {
  return {
    ...state,
    projects: state.projects.map((project) => project.id !== projectId ? project : {
      ...project,
      status: issue.severity === "Bloquant" ? "Bloqué" : project.status,
      issues: [{
        ...issue,
        id: `issue-${Date.now()}`,
        resolved: false,
        createdAt: nowIso(),
      }, ...project.issues],
    }),
  };
}

export function addProjectPhoto(state: CommercialDemoState, projectId: string, photo: Omit<CommercialProjectPhoto, "id" | "createdAt">) {
  return {
    ...state,
    projects: state.projects.map((project) => project.id !== projectId ? project : {
      ...project,
      photos: [{ ...photo, id: `photo-${Date.now()}`, createdAt: nowIso() }, ...project.photos].slice(0, 12),
    }),
  };
}

export function hasActiveDocumentFilters(filters: DocumentFilters) {
  return Boolean(
    filters.customerId ||
    filters.status ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.minAmount ||
    filters.maxAmount,
  );
}

export function filterBusinessDocuments<T extends AnyDocument>(documents: T[], filters: DocumentFilters): T[] {
  const min = filters.minAmount === "" ? null : Number(filters.minAmount);
  const max = filters.maxAmount === "" ? null : Number(filters.maxAmount);
  return documents.filter((document) => {
    const documentDate = document.issueDate;
    if (filters.customerId && document.customerId !== filters.customerId) return false;
    if (filters.status && document.status !== filters.status) return false;
    if (filters.dateFrom && documentDate < filters.dateFrom) return false;
    if (filters.dateTo && documentDate > filters.dateTo) return false;
    if (min !== null && Number.isFinite(min) && document.total < min) return false;
    if (max !== null && Number.isFinite(max) && document.total > max) return false;
    return true;
  });
}

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T12:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export function buildCommercialNotifications(
  workspace: MobileWorkspace,
  commercial: CommercialDemoState,
): CommercialNotification[] {
  const notifications: CommercialNotification[] = [];

  workspace.quotes
    .filter((quote) => quote.status === "En attente")
    .forEach((quote) => {
      const remaining = daysUntil(quote.expiryDate);
      if (remaining <= 14) {
        notifications.push({
          id: `quote-${quote.id}`,
          tone: remaining < 0 ? "danger" : "warning",
          title: remaining < 0 ? "Devis arrivé à expiration" : "Devis à relancer",
          detail: `${quote.number} · ${quote.customerName} · ${remaining < 0 ? `${Math.abs(remaining)} j de retard` : `${remaining} j restants`}`,
          documentKind: "quote",
          documentNumber: quote.number,
        });
      }
    });

  workspace.invoices
    .filter((invoice) => invoice.status !== "Payée" && invoice.status !== "Avoir" && daysUntil(invoice.dueDate) < 0)
    .forEach((invoice) => notifications.push({
      id: `invoice-${invoice.id}`,
      tone: "danger",
      title: "Facture en retard",
      detail: `${invoice.number} · ${invoice.customerName} · ${Math.abs(daysUntil(invoice.dueDate))} j de retard`,
      documentKind: "invoice",
      documentNumber: invoice.number,
    }));

  workspace.agenda
    .filter((entry) => !entry.done && entry.date === isoDate())
    .forEach((entry) => notifications.push({
      id: `agenda-${entry.id}`,
      tone: "info",
      title: `${entry.time} · ${entry.type}`,
      detail: `${entry.title} · ${entry.customerName}`,
    }));

  commercial.projects.forEach((project) => {
    const blocking = project.issues.filter((issue) => !issue.resolved && issue.severity === "Bloquant");
    if (blocking.length) {
      notifications.push({
        id: `project-${project.id}`,
        tone: "danger",
        title: "Blocage chantier",
        detail: `${project.name} · ${blocking[0].title}`,
        projectId: project.id,
      });
    }
  });

  if (!notifications.length) {
    notifications.push({
      id: "all-clear",
      tone: "success",
      title: "Tout est sous contrôle",
      detail: "Aucune échéance critique ou action bloquante aujourd’hui.",
    });
  }
  return notifications;
}

export function findBusinessDocument(workspace: MobileWorkspace, number: string) {
  const quote = workspace.quotes.find((item) => item.number === number);
  if (quote) return { kind: "quote" as const, document: quote };
  const invoice = workspace.invoices.find((item) => item.number === number);
  return invoice ? { kind: "invoice" as const, document: invoice } : null;
}

export function findCustomer(workspace: MobileWorkspace, customerId: string): MobileCustomer | null {
  return workspace.customers.find((customer) => customer.id === customerId) ?? null;
}

export function statusOptions(kind: DemoDocumentKind): Array<QuoteStatus | InvoiceStatus> {
  return kind === "quote"
    ? ["En attente", "Validé", "Terminé", "Refusé"]
    : ["Brouillon", "En cours", "Payée", "En retard", "Avoir"];
}

export function agendaForProject(agenda: MobileAgendaEntry[], project: CommercialProject) {
  return agenda.filter((entry) => entry.customerId === project.customerId);
}

export function exportCommercialBackup(storage: Pick<Storage, "getItem">): string {
  const workspaceRaw = storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
  if (!workspaceRaw) throw new Error("Aucune donnée métier à sauvegarder.");
  const workspace = JSON.parse(workspaceRaw) as MobileWorkspace;
  const quoteMetaRaw = storage.getItem(QUOTE_META_STORAGE_KEY);
  const commercial = readCommercialDemoState(storage);
  const backup: CommercialBackup = {
    version: COMMERCIAL_BACKUP_VERSION,
    exportedAt: nowIso(),
    workspace,
    quoteMeta: quoteMetaRaw ? JSON.parse(quoteMetaRaw) : {},
    commercial,
  };
  return JSON.stringify(backup, null, 2);
}

export function importCommercialBackup(storage: StorageLike, raw: string) {
  const parsed = JSON.parse(raw) as Partial<CommercialBackup>;
  if (parsed.version !== COMMERCIAL_BACKUP_VERSION || !parsed.workspace || !parsed.commercial) {
    throw new Error("Ce fichier de sauvegarde n’est pas compatible.");
  }
  if (!Array.isArray(parsed.workspace.customers) || !Array.isArray(parsed.workspace.quotes) || !Array.isArray(parsed.workspace.invoices)) {
    throw new Error("La sauvegarde ne contient pas un espace de travail valide.");
  }
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(parsed.workspace));
  storage.setItem(QUOTE_META_STORAGE_KEY, JSON.stringify(parsed.quoteMeta ?? {}));
  storage.setItem(COMMERCIAL_DEMO_STORAGE_KEY, JSON.stringify(parsed.commercial));
}
