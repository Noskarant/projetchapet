import { customerDisplayName, type MobileAgendaEntry, type MobileCustomer } from "./mobile-prototype";

export type ExecutedVoiceAction = {
  id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type VoiceEmailDraft = {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
};

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function comparable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function voiceAgendaEntry(action: ExecutedVoiceAction, customers: MobileCustomer[]): MobileAgendaEntry | null {
  const payload = action.payload;
  const date = clean(payload.date, 10);
  const time = clean(payload.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const hint = clean(payload.customer_hint, 180);
  const wanted = comparable(hint);
  const matches = wanted ? customers.filter((customer) => {
    const name = comparable(customerDisplayName(customer));
    const naturalName = customer.kind === "Particulier" ? comparable([customer.firstName, customer.lastName].filter(Boolean).join(" ")) : name;
    return name === wanted || name.includes(wanted) || wanted.includes(name)
      || Boolean(naturalName && (naturalName === wanted || naturalName.includes(wanted) || wanted.includes(naturalName)));
  }) : [];
  const customer = matches.length === 1 ? matches[0] : null;
  const title = clean(payload.title, 260) || "Rendez-vous";
  const location = clean(payload.location, 320);
  const notes = clean(payload.notes, 1200);
  const details = [location, notes].filter((part) => part && !title.includes(part));
  const type = ["Chantier", "Commande", "Facturation", "Relance"].includes(clean(payload.type))
    ? clean(payload.type) as MobileAgendaEntry["type"] : "Chantier";
  return {
    id: `voice-${action.id}`,
    date,
    time,
    type,
    title: [title, ...details].join(" · "),
    customerId: customer?.id ?? "",
    customerName: customer ? customerDisplayName(customer) : hint,
    done: false,
  };
}

export function voiceEmailDraft(action: ExecutedVoiceAction): VoiceEmailDraft | null {
  const to = clean(action.payload.to, 254);
  const subject = clean(action.payload.subject, 300);
  const body = clean(action.payload.body, 6000);
  if (!to || !subject || !body) return null;
  return { id: action.id, to, subject, body, createdAt: action.created_at };
}
