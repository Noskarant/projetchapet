"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  HardHat,
  MapPin,
  Mail,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  addProjectIssue,
  addProjectPhoto,
  appendActivity,
  calculateProjectProgress,
  setProjectIssueResolved,
  toggleProjectStep,
  type CommercialDemoState,
  type CommercialProjectIssue,
  type CommercialProject,
  type ProjectTab,
} from "@/lib/mobile-commercial-demo";

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

export default function MobileCommercialProjects({
  state,
  selectedProjectId,
  onSelectProject,
  onChange,
  onNotify,
  onDownloadDocument,
  onCreateQuote,
  customerEmail = "",
  onSendPhotoReport,
}: {
  state: CommercialDemoState;
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onChange: (state: CommercialDemoState) => void;
  onNotify: (message: string) => void;
  onDownloadDocument: (projectId: string, withoutPrices: boolean) => void;
  onCreateQuote: (customerId: string, title: string) => void;
  customerEmail?: string;
  onSendPhotoReport?: (project: CommercialProject, photoIds: string[], recipient: string) => Promise<void>;
}) {
  const latestState = useRef(state); latestState.current = state;
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [autoSend, setAutoSend] = useState<Record<string, boolean>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const operationBusy = useRef(false);
  const [tab, setTab] = useState<ProjectTab>("suivi");
  const [workerMode, setWorkerMode] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueDraft, setIssueDraft] = useState<
    Pick<CommercialProjectIssue, "title" | "detail" | "severity">
  >({ title: "", detail: "", severity: "À surveiller" });

  const project = useMemo(
    () => state.projects.find((item) => item.id === selectedProjectId) ?? state.projects[0] ?? null,
    [selectedProjectId, state.projects],
  );
  const filteredProjects = state.projects.filter((item) =>
    `${item.name} ${item.subtitle} ${item.address} ${item.status}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .includes(projectSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()),
  );

  if (!project) {
    return (
      <div className="rm-commercial-body">
        <div className="rm-project-empty">
          <HardHat size={24} />
          <strong>Aucun chantier disponible</strong>
        </div>
      </div>
    );
  }

  const updateStep = (stepId: string) => {
    const step = project.steps.find((item) => item.id === stepId);
    onChange(
      appendActivity(toggleProjectStep(state, project.id, stepId), {
        kind: "chantier",
        message: `${project.name} · étape « ${step?.label || "Chantier"} » ${step?.done ? "rouverte" : "terminée"}.`,
        projectId: project.id,
      }),
    );
  };

  const submitIssue = () => {
    if (!issueDraft.title.trim()) {
      onNotify("Donnez un titre au signalement.");
      return;
    }

    onChange(
      appendActivity(
        addProjectIssue(state, project.id, {
          ...issueDraft,
          title: issueDraft.title.trim(),
          detail: issueDraft.detail.trim(),
        }),
        {
          kind: "chantier",
          message: `${project.name} · nouveau signalement « ${issueDraft.title.trim()} ».`,
          projectId: project.id,
        },
      ),
    );
    setIssueDraft({ title: "", detail: "", severity: "À surveiller" });
    setShowIssueForm(false);
    onNotify("Signalement enregistré.");
  };

  const sendReport = async (current: CommercialProject, ids: string[]) => {
    if (!onSendPhotoReport) return;
    setReportBusy(true); setReportMessage("Préparation et synchronisation du dossier…");
    try {
      await onSendPhotoReport(current, ids, recipients[current.id] ?? customerEmail);
      setReportMessage("Dossier photo envoyé.");
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Envoi du dossier impossible.");
    } finally { setReportBusy(false); }
  };

  const handlePhoto = async (files: File[]) => {
    if (!files.length || operationBusy.current) return;
    operationBusy.current = true; setPhotoBusy(true); setReportMessage('');
    try {
      if (files.length > 6) throw new Error('Ajoutez au maximum 6 photos à la fois.');
      const prepared = [];
      for (const file of files) {
        if (!file.type.startsWith('image/') || file.size > 10_000_000) throw new Error('Choisissez des photos de moins de 10 Mo.');
        prepared.push({ name: file.name, caption: 'Photo chantier', dataUrl: await compressImage(file) });
      }
      let next = latestState.current;
      const current = next.projects.find(item => item.id === project.id);
      if (!current) throw new Error('Chantier indisponible.');
      if (current.photos.length + prepared.length > 100) throw new Error('Maximum 100 photos par chantier. Les photos existantes sont conservées.');
      for (const photo of prepared) next = addProjectPhoto(next, project.id, photo);
      next = appendActivity(next, { kind: 'chantier', message: `${project.name} · ${prepared.length} photo(s) ajoutée(s) au suivi.`, projectId: project.id });
      onChange(next);
      const updated = next.projects.find(item => item.id === project.id)!;
      const ids = selections[project.id] ? [...selections[project.id], ...updated.photos.filter(photo => !current.photos.some(old => old.id === photo.id)).map(photo => photo.id)] : updated.photos.map(photo => photo.id);
      setSelections(values => ({ ...values, [project.id]: ids }));
      onNotify('Photos ajoutées au chantier.');
      if (autoSend[project.id]) await sendReport(updated, ids);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ajout de photos impossible.';
      setReportMessage(message); onNotify(message);
    } finally { operationBusy.current = false; setPhotoBusy(false); }
  };

  const resolveIssue = (issueId: string) => {
    const issue = project.issues.find((item) => item.id === issueId);
    if (!issue) return;
    onChange(
      appendActivity(
        setProjectIssueResolved(state, project.id, issueId, !issue.resolved),
        {
          kind: "chantier",
          message: `${project.name} · signalement « ${issue.title} » ${issue.resolved ? "rouvert" : "résolu"}.`,
          projectId: project.id,
        },
      ),
    );
  };

  const toggleCollaborator = (personId: string) => {
    const assigned = project.teamIds.includes(personId);
    onChange({
      ...state,
      projects: state.projects.map((item) =>
        item.id !== project.id
          ? item
          : {
              ...item,
              teamIds: assigned
                ? item.teamIds.filter((id) => id !== personId)
                : [...item.teamIds, personId],
            },
      ),
    });
  };

  if (workerMode) {
    return (
      <div className="rm-commercial-body rm-worker-view">
        <button className="rm-worker-back" type="button" onClick={() => setWorkerMode(false)}>
          ← Retour direction
        </button>
        <label className="rm-project-search"><Search size={17} /><input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Rechercher un chantier" /></label>
        <div className="rm-project-switcher">{filteredProjects.map((item) => <button type="button" key={item.id} disabled={photoBusy || reportBusy} className={project.id === item.id ? "active" : ""} onClick={() => onSelectProject(item.id)}>{item.name}</button>)}</div>

        <section className="rm-worker-hero">
          <span className="rm-worker-badge"><HardHat size={17} /> ESPACE ÉQUIPE</span>
          <h3>{project.name}</h3>
          <p>{project.subtitle}</p>
          <div><MapPin size={16} /> {project.address}</div>
        </section>

        <div className="rm-worker-progress">
          <div><strong>Avancement du chantier</strong><span>{calculateProjectProgress(project)} %</span></div>
          <i><b style={{ width: `${calculateProjectProgress(project)}%` }} /></i>
        </div>

        <h4>Mes étapes</h4>
        <div className="rm-project-steps">
          {project.steps.map((step) => (
            <button
              type="button"
              key={step.id}
              className={step.done ? "done" : ""}
              onClick={() => updateStep(step.id)}
            >
              <span>{step.done ? <Check size={18} /> : null}</span>
              <div>
                <strong>{step.label}</strong>
                <small>À réaliser avant le {dateFr(step.dueDate)}</small>
              </div>
            </button>
          ))}
        </div>

        <div className="rm-worker-actions">
          <label>
            <Camera size={20} />
            <span>Ajouter une photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={photoBusy || reportBusy}
              onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void handlePhoto(files); }}
            />
          </label>
          <button type="button" onClick={() => setShowIssueForm((value) => !value)}>
            <AlertTriangle size={20} /> Signaler un problème
          </button>
          <button type="button" onClick={() => onDownloadDocument(project.id, true)}>
            <Download size={20} /> Consulter le document
          </button>
        </div>

        {showIssueForm && (
          <IssueForm draft={issueDraft} onChange={setIssueDraft} onSubmit={submitIssue} />
        )}
      </div>
    );
  }

  return (
    <div className="rm-commercial-body rm-project-body">
      <label className="rm-project-search"><Search size={17} /><input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Rechercher un chantier" /></label>
      <div className="rm-project-switcher">
        {filteredProjects.map((item) => (
          <button
            type="button"
            key={item.id}
            disabled={photoBusy || reportBusy} className={project.id === item.id ? "active" : ""}
            onClick={() => {
              onSelectProject(item.id);
              setTab("suivi");
            }}
          >
            <div>
              <strong>{item.name}</strong>
              <small>{item.subtitle}</small>
            </div>
            <span>{calculateProjectProgress(item)} %</span>
          </button>
        ))}
      </div>

      <section className="rm-project-hero">
        <div className="rm-project-hero-top">
          <span className={`status ${project.status.toLowerCase().replaceAll(" ", "-")}`}>
            {project.status}
          </span>
          <button type="button" onClick={() => setWorkerMode(true)}>
            <ShieldCheck size={17} /> Voir comme l’équipe
          </button>
        </div>
        <h3>{project.name}</h3>
        <button className="rm-project-create-quote" type="button" onClick={() => onCreateQuote(project.customerId, project.name)}><Plus size={17} /> Créer un devis pour ce chantier</button>
        <p>{project.subtitle}</p>
        <div className="rm-project-location"><MapPin size={16} /> {project.address}</div>
        <div className="rm-project-progress">
          <div><span>Avancement</span><strong>{calculateProjectProgress(project)} %</strong></div>
          <i><b style={{ width: `${calculateProjectProgress(project)}%` }} /></i>
          <small>Prochaine intervention : {dateFr(project.nextVisit)}</small>
        </div>
      </section>

      <nav className="rm-project-tabs">
        {(["suivi", "equipe", "photos", "documents"] as ProjectTab[]).map((item) => (
          <button
            type="button"
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item === "suivi" ? "Suivi" : item === "equipe" ? "Équipe" : item === "photos" ? "Photos" : "Documents"}
          </button>
        ))}
      </nav>

      {tab === "suivi" && (
        <div className="rm-project-section">
          <SectionTitle eyebrow="ÉTAPES" title="Planning opérationnel" value={`${project.steps.filter((step) => step.done).length}/${project.steps.length}`} />
          <div className="rm-project-steps">
            {project.steps.map((step) => {
              const collaborator = state.collaborators.find((item) => item.id === step.assigneeId);
              return (
                <button
                  type="button"
                  key={step.id}
                  className={step.done ? "done" : ""}
                  onClick={() => updateStep(step.id)}
                >
                  <span>{step.done ? <Check size={18} /> : null}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{collaborator?.name || "Non affecté"} · {dateFr(step.dueDate)}</small>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rm-project-section-title issues">
            <div><small>SIGNALEMENTS</small><strong>Points à traiter</strong></div>
            <button type="button" onClick={() => setShowIssueForm((value) => !value)}>+ Ajouter</button>
          </div>

          {showIssueForm && (
            <IssueForm draft={issueDraft} onChange={setIssueDraft} onSubmit={submitIssue} />
          )}

          <div className="rm-project-issues">
            {project.issues.map((issue) => (
              <article
                key={issue.id}
                className={`${issue.severity.toLowerCase().replaceAll(" ", "-")} ${issue.resolved ? "resolved" : ""}`}
              >
                <span><AlertTriangle size={17} /></span>
                <div><strong>{issue.title}</strong><small>{issue.detail}</small></div>
                <button type="button" onClick={() => resolveIssue(issue.id)}>
                  {issue.resolved ? "Rouvrir" : "Résoudre"}
                </button>
              </article>
            ))}
            {project.issues.length === 0 && (
              <div className="rm-project-empty">
                <CheckCircle2 size={22} />
                <strong>Aucun point bloquant</strong>
                <span>Le chantier peut avancer normalement.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "equipe" && (
        <div className="rm-project-section">
          <SectionTitle eyebrow="COLLABORATEURS" title="Équipe affectée" value={String(project.teamIds.length)} />
          <div className="rm-project-team">
            {state.collaborators.map((person) => {
              const assigned = project.teamIds.includes(person.id);
              return (
                <article key={person.id}>
                  <span>{person.initials}</span>
                  <div>
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                    <a href={`tel:${person.phone.replaceAll(" ", "")}`}>{person.phone}</a>
                  </div>
                  <button
                    type="button"
                    className={assigned ? "assigned" : ""}
                    onClick={() => toggleCollaborator(person.id)}
                  >
                    {assigned ? "Affecté" : "Affecter"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === "photos" && (
        <div className="rm-project-section">
          <label className="rm-project-photo-upload">
            <Camera size={24} />
            <strong>Ajouter une photo chantier</strong>
            <span>Appareil photo ou photothèque</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={photoBusy || reportBusy}
              onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void handlePhoto(files); }}
            />
          </label>
          <label className="rm-project-photo-upload">
            <Plus size={20} /><strong>Choisir plusieurs photos</strong>
            <input type="file" accept="image/*" multiple aria-label="Photos du chantier" disabled={photoBusy || reportBusy} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void handlePhoto(files); }} />
          </label>
          {photoBusy && <p role="status">Ajout des photos…</p>}
          {onSendPhotoReport && <div className="rm-photo-report">
            <strong>Dossier photo pour le client</strong>
            <label>Destinataire<input type="email" value={recipients[project.id] ?? customerEmail} disabled={photoBusy || reportBusy} onChange={event => setRecipients(values => ({ ...values, [project.id]: event.target.value }))} /></label>
            <label className="rm-photo-auto"><input type="checkbox" checked={Boolean(autoSend[project.id])} disabled={photoBusy || reportBusy} onChange={event => setAutoSend(values => ({ ...values, [project.id]: event.target.checked }))} />Envoyer automatiquement après chaque ajout</label>
            <small>Un PDF rassemble les photos sélectionnées. L’envoi automatique concerne ce chantier pendant cette session.</small>
            <button type="button" disabled={photoBusy || reportBusy || !(selections[project.id] ?? project.photos.map(photo => photo.id)).length} onClick={() => { if (operationBusy.current) return; operationBusy.current = true; void sendReport(project, selections[project.id] ?? project.photos.map(photo => photo.id)).finally(() => { operationBusy.current = false; }); }}><Mail size={18} /> {reportBusy ? 'Envoi en cours…' : 'Envoyer le dossier au client'}</button>
            {reportMessage && <p role="status">{reportMessage}</p>}
          </div>}
          <div className="rm-project-gallery">
            {project.photos.map((photo) => (
              <figure key={photo.id}>
                {onSendPhotoReport && <label className="rm-photo-selection"><input type="checkbox" aria-label={`Inclure ${photo.name}`} disabled={photoBusy || reportBusy} checked={(selections[project.id] ?? project.photos.map(item => item.id)).includes(photo.id)} onChange={event => { const ids = selections[project.id] ?? project.photos.map(item => item.id); setSelections(values => ({ ...values, [project.id]: event.target.checked ? [...ids, photo.id] : ids.filter(id => id !== photo.id) })); }} />Inclure au dossier</label>}
                {photo.dataUrl ? <img src={photo.dataUrl} alt={photo.caption} /> : <Camera size={28} />}
                <figcaption><strong>{photo.caption}</strong><small>{timeFr(photo.createdAt)}</small></figcaption>
              </figure>
            ))}
            {project.photos.length === 0 && (
              <div className="rm-project-empty">
                <Camera size={22} />
                <strong>Aucune photo pour le moment</strong>
                <span>Ajoutez la première photo de suivi.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="rm-project-section">
          <DocumentCard
            icon={<FileText size={25} />}
            title="Document client"
            description="Prix, TVA, remise et conditions de validation"
            onDownload={() => onDownloadDocument(project.id, false)}
          />
          <DocumentCard
            className="worker"
            icon={<ClipboardCheck size={25} />}
            title="Document équipe sans prix"
            description="Prestations, quantités et consignes uniquement"
            onDownload={() => onDownloadDocument(project.id, true)}
          />
          <div className="rm-project-document-info">
            <ShieldCheck size={19} />
            <span>Les notes personnelles, marges et prix restent invisibles dans la version collaborateur.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ eyebrow, title, value }: { eyebrow: string; title: string; value: string }) {
  return (
    <div className="rm-project-section-title">
      <div><small>{eyebrow}</small><strong>{title}</strong></div>
      <span>{value}</span>
    </div>
  );
}

function IssueForm({
  draft,
  onChange,
  onSubmit,
}: {
  draft: Pick<CommercialProjectIssue, "title" | "detail" | "severity">;
  onChange: (draft: Pick<CommercialProjectIssue, "title" | "detail" | "severity">) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rm-project-issue-form">
      <input
        placeholder="Titre du signalement"
        value={draft.title}
        onChange={(event) => onChange({ ...draft, title: event.target.value })}
      />
      <textarea
        placeholder="Détail utile à l’équipe"
        value={draft.detail}
        onChange={(event) => onChange({ ...draft, detail: event.target.value })}
      />
      <select
        value={draft.severity}
        onChange={(event) => onChange({ ...draft, severity: event.target.value as CommercialProjectIssue["severity"] })}
      >
        <option>Information</option>
        <option>À surveiller</option>
        <option>Bloquant</option>
      </select>
      <button type="button" onClick={onSubmit}><AlertTriangle size={17} /> Enregistrer</button>
    </div>
  );
}

function DocumentCard({
  icon,
  title,
  description,
  className = "",
  onDownload,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  onDownload: () => void;
}) {
  return (
    <div className={`rm-project-document-card ${className}`}>
      {icon}
      <div><strong>{title}</strong><small>{description}</small></div>
      <button type="button" onClick={onDownload}><Download size={18} /> PDF</button>
    </div>
  );
}
