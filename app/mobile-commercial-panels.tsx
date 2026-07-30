"use client";

import {
  AlertTriangle,
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Filter,
  HardHat,
  History,
  Mail,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type {
  ActivityEvent,
  CommercialCompanySettings,
  CommercialNotification,
  DemoDocumentKind,
  DocumentFilters,
} from "@/lib/mobile-commercial-demo";
import { statusOptions } from "@/lib/mobile-commercial-demo";
import type { MobileBusinessDocument } from "@/lib/mobile-document-pdf";
import type { MobileWorkspace } from "@/lib/mobile-prototype";

export type EmailDraft = {
  document: MobileBusinessDocument;
  recipient: string;
  subject: string;
  message: string;
  withoutPrices: boolean;
};

const timeFr = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function FilterPanel({
  workspace,
  kind,
  draft,
  onChange,
  onApply,
  onReset,
}: {
  workspace: MobileWorkspace | null;
  kind: DemoDocumentKind;
  draft: DocumentFilters;
  onChange: (draft: DocumentFilters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-intro">
        <Filter size={22} />
        <div>
          <strong>Affinez la liste en quelques secondes</strong>
          <span>Les filtres se combinent avec la recherche et les statuts rapides.</span>
        </div>
      </div>

      <div className="rm-commercial-form">
        <label>
          Client
          <select
            value={draft.customerId}
            onChange={(event) => onChange({ ...draft, customerId: event.target.value })}
          >
            <option value="">Tous les clients</option>
            {workspace?.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.kind === "Professionnel"
                  ? customer.companyName
                  : `${customer.civility} ${customer.lastName} ${customer.firstName}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          Statut
          <select
            value={draft.status}
            onChange={(event) => onChange({ ...draft, status: event.target.value })}
          >
            <option value="">Tous les statuts</option>
            {statusOptions(kind).map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>

        <div className="rm-commercial-two">
          <label>
            Émis après
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) => onChange({ ...draft, dateFrom: event.target.value })}
            />
          </label>
          <label>
            Émis avant
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) => onChange({ ...draft, dateTo: event.target.value })}
            />
          </label>
        </div>

        <div className="rm-commercial-two">
          <label>
            Montant minimum
            <input
              type="number"
              inputMode="decimal"
              placeholder="0 €"
              value={draft.minAmount}
              onChange={(event) => onChange({ ...draft, minAmount: event.target.value })}
            />
          </label>
          <label>
            Montant maximum
            <input
              type="number"
              inputMode="decimal"
              placeholder="Sans limite"
              value={draft.maxAmount}
              onChange={(event) => onChange({ ...draft, maxAmount: event.target.value })}
            />
          </label>
        </div>
      </div>

      <footer className="rm-commercial-footer">
        <button className="secondary" type="button" onClick={onReset}>
          <RefreshCw size={18} /> Réinitialiser
        </button>
        <button className="primary" type="button" onClick={onApply}>
          <Check size={18} /> Appliquer les filtres
        </button>
      </footer>
    </div>
  );
}

export function NotificationsPanel({
  notifications,
  onOpen,
}: {
  notifications: CommercialNotification[];
  onOpen: (notification: CommercialNotification) => void;
}) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-notification-summary">
        <BellRing size={23} />
        <div>
          <strong>
            {notifications.length} point{notifications.length > 1 ? "s" : ""} à regarder
          </strong>
          <span>Échéances, relances, agenda et blocages chantier.</span>
        </div>
      </div>

      <div className="rm-commercial-notifications">
        {notifications.map((notification) => (
          <button
            type="button"
            key={notification.id}
            className={notification.tone}
            onClick={() => onOpen(notification)}
          >
            <span className="icon">
              {notification.tone === "danger" ? (
                <AlertTriangle size={19} />
              ) : notification.tone === "success" ? (
                <CheckCircle2 size={19} />
              ) : (
                <BellRing size={19} />
              )}
            </span>
            <div>
              <strong>{notification.title}</strong>
              <small>{notification.detail}</small>
            </div>
            {(notification.documentNumber || notification.projectId) && <ChevronRight size={18} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ActivityPanel({ activity }: { activity: ActivityEvent[] }) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-intro">
        <History size={22} />
        <div>
          <strong>Traçabilité métier</strong>
          <span>Les actions importantes restent visibles dans un historique simple.</span>
        </div>
      </div>

      <div className="rm-commercial-timeline">
        {activity.map((event) => (
          <article key={event.id}>
            <span className={event.kind}>
              {event.kind === "status" ? (
                <RefreshCw size={16} />
              ) : event.kind === "chantier" ? (
                <HardHat size={16} />
              ) : event.kind === "email" ? (
                <Mail size={16} />
              ) : event.kind === "data" ? (
                <Save size={16} />
              ) : (
                <FileText size={16} />
              )}
            </span>
            <div>
              <strong>{event.message}</strong>
              <small>
                {timeFr(event.createdAt)}
                {event.documentNumber ? ` · ${event.documentNumber}` : ""}
              </small>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function BackupPanel({
  onExport,
  onImport,
  onReset,
}: {
  onExport: () => void;
  onImport: (file: File | null) => void;
  onReset: () => void;
}) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-intro">
        <ShieldCheck size={22} />
        <div>
          <strong>Vos données restent récupérables</strong>
          <span>
            La sauvegarde contient clients, devis, factures, agenda, remises, chantiers et réglages.
          </span>
        </div>
      </div>

      <div className="rm-backup-cards">
        <button type="button" onClick={onExport}>
          <Download size={24} />
          <div>
            <strong>Exporter une sauvegarde complète</strong>
            <span>Fichier JSON horodaté, utilisable sur un autre appareil.</span>
          </div>
          <ChevronRight size={18} />
        </button>

        <label>
          <Upload size={24} />
          <div>
            <strong>Restaurer une sauvegarde</strong>
            <span>Importez un fichier précédemment exporté.</span>
          </div>
          <ChevronRight size={18} />
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => onImport(event.target.files?.[0] || null)}
          />
        </label>

        <button type="button" className="subtle" onClick={onReset}>
          <RefreshCw size={22} />
          <div>
            <strong>Réinitialiser les compléments de démo</strong>
            <span>Conserve les devis, factures et clients existants.</span>
          </div>
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: CommercialCompanySettings;
  onChange: (draft: CommercialCompanySettings) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-intro">
        <BriefcaseBusiness size={22} />
        <div>
          <strong>Informations utilisées dans les documents</strong>
          <span>Ces données alimentent les PDF, les e-mails et les écrans de démonstration.</span>
        </div>
      </div>

      <div className="rm-commercial-form">
        <label>
          Nom affiché
          <input value={draft.displayName} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} />
        </label>
        <label>
          Raison sociale
          <input value={draft.legalName} onChange={(event) => onChange({ ...draft, legalName: event.target.value })} />
        </label>
        <div className="rm-commercial-two">
          <label>
            SIRET
            <input value={draft.siret} onChange={(event) => onChange({ ...draft, siret: event.target.value })} />
          </label>
          <label>
            N° TVA
            <input value={draft.vat} onChange={(event) => onChange({ ...draft, vat: event.target.value })} />
          </label>
        </div>
        <div className="rm-commercial-two">
          <label>
            E-mail
            <input type="email" value={draft.email} onChange={(event) => onChange({ ...draft, email: event.target.value })} />
          </label>
          <label>
            E-mail comptable
            <input type="email" value={draft.accountingEmail} onChange={(event) => onChange({ ...draft, accountingEmail: event.target.value })} />
          </label>
        </div>
        <label>
          Téléphone
          <input value={draft.phone} onChange={(event) => onChange({ ...draft, phone: event.target.value })} />
        </label>
        <label>
          Adresse
          <input value={draft.address} onChange={(event) => onChange({ ...draft, address: event.target.value })} />
        </label>
        <div className="rm-commercial-two">
          <label>
            Code postal
            <input value={draft.postalCode} onChange={(event) => onChange({ ...draft, postalCode: event.target.value })} />
          </label>
          <label>
            Ville
            <input value={draft.city} onChange={(event) => onChange({ ...draft, city: event.target.value })} />
          </label>
        </div>
        <div className="rm-commercial-two">
          <label>
            Validité devis (jours)
            <input
              type="number"
              min="1"
              value={draft.quoteValidityDays}
              onChange={(event) => onChange({ ...draft, quoteValidityDays: Number(event.target.value) })}
            />
          </label>
          <label>
            Couleur principale
            <select
              value={draft.accent}
              onChange={(event) => onChange({ ...draft, accent: event.target.value as CommercialCompanySettings["accent"] })}
            >
              <option value="blue">Bleu professionnel</option>
              <option value="indigo">Indigo</option>
              <option value="emerald">Vert chantier</option>
            </select>
          </label>
        </div>
        <label>
          Conditions de règlement
          <textarea
            rows={3}
            value={draft.paymentTerms}
            onChange={(event) => onChange({ ...draft, paymentTerms: event.target.value })}
          />
        </label>
      </div>

      <footer className="rm-commercial-footer">
        <button className="secondary" type="button" onClick={onCancel}>Annuler</button>
        <button className="primary" type="button" onClick={onSave}>
          <Save size={18} /> Enregistrer
        </button>
      </footer>
    </div>
  );
}

export function EmailPanel({
  draft,
  busy,
  onChange,
  onSend,
  onCancel,
}: {
  draft: EmailDraft;
  busy: boolean;
  onChange: (draft: EmailDraft) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rm-commercial-body">
      <div className="rm-commercial-intro">
        <Mail size={22} />
        <div>
          <strong>{draft.document.number}</strong>
          <span>
            Le PDF joint reprend les lignes, prix, TVA, remise et notes client. Les notes personnelles restent exclues.
          </span>
        </div>
      </div>

      <div className="rm-commercial-form">
        <label>
          Destinataire
          <input
            type="email"
            value={draft.recipient}
            onChange={(event) => onChange({ ...draft, recipient: event.target.value })}
          />
        </label>
        <label>
          Objet
          <input value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} />
        </label>
        <label>
          Message
          <textarea
            rows={8}
            value={draft.message}
            onChange={(event) => onChange({ ...draft, message: event.target.value })}
          />
        </label>
        <label className="rm-commercial-check">
          <input
            type="checkbox"
            checked={draft.withoutPrices}
            onChange={(event) => onChange({ ...draft, withoutPrices: event.target.checked })}
          />
          <span>Joindre la version chantier sans prix</span>
        </label>
      </div>

      <div className="rm-email-security">
        <ShieldCheck size={18} />
        <span>Pièce jointe générée au moment de l’envoi avec les dernières informations enregistrées.</span>
      </div>

      <footer className="rm-commercial-footer">
        <button className="secondary" type="button" onClick={onCancel}>Annuler</button>
        <button className="primary" type="button" onClick={onSend} disabled={busy}>
          <Send size={18} /> {busy ? "Envoi…" : "Envoyer avec le PDF"}
        </button>
      </footer>
    </div>
  );
}
