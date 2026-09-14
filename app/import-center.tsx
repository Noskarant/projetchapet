"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitImport,
  fetchImportHistory,
  previewImport,
  rollbackImport,
  type ImportHistoryJob,
  type ImportPreviewResponse,
} from "@/lib/import-client";
import type { ImportEntityType, ImportSourceSystem } from "@/lib/import-migration";
import { getActiveOrganizationId } from "@/lib/project-chapet";
import "./import-center.css";

type Step = "upload" | "review" | "done" | "history";
type EntityChoice = "auto" | ImportEntityType;

const SOURCE_LABELS: Record<ImportSourceSystem, string> = {
  generic: "CSV générique",
  tolteck: "Tolteck",
  obat: "Obat",
  costructor: "Costructor",
  ebp: "EBP",
  other: "Autre logiciel",
};

function statusLabel(status: string) {
  if (status === "completed") return "Importé";
  if (status === "rolled_back") return "Annulé";
  if (status === "rollback_partial") return "Rollback partiel";
  if (status === "failed") return "Échec";
  if (status === "importing") return "Import en cours";
  return "Prévisualisation";
}

function entityLabel(entity: string) {
  return entity === "catalog" ? "Catalogue" : "Clients";
}

function displayCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  return String(value);
}

export default function ImportCenter() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [organizationId, setOrganizationId] = useState("");
  const [source, setSource] = useState<ImportSourceSystem>("generic");
  const [entityChoice, setEntityChoice] = useState<EntityChoice>("auto");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "create">("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<ImportHistoryJob[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [rollbackConfirmId, setRollbackConfirmId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshHistory = useCallback(async (orgId: string) => {
    setHistoryBusy(true);
    try {
      setHistory(await fetchImportHistory(orgId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Historique indisponible.");
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setSource("generic");
    setEntityChoice("auto");
    setFileName("");
    setCsv("");
    setPreview(null);
    setMapping({});
    setDuplicateStrategy("skip");
    setConfirmed(false);
    setMessage("");
    setResult(null);
    setRollbackConfirmId(null);
  }, []);

  useEffect(() => {
    const openCenter = async () => {
      setOpen(true);
      reset();
      try {
        const orgId = await getActiveOrganizationId();
        setOrganizationId(orgId);
        void refreshHistory(orgId);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Entreprise inaccessible.");
      }
    };
    window.addEventListener("manufeo:open-import-center", openCenter);
    return () => window.removeEventListener("manufeo:open-import-center", openCenter);
  }, [refreshHistory, reset]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function close() {
    setOpen(false);
    setRollbackConfirmId(null);
  }

  async function readFile(file: File | null) {
    if (!file) return;
    setMessage("");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setMessage("Pour cet import sécurisé, exportez le classeur Excel en CSV UTF-8 puis déposez le fichier CSV ici.");
      return;
    }
    if (!lower.endsWith(".csv") && !lower.endsWith(".txt") && file.type && !/csv|text/i.test(file.type)) {
      setMessage("Format non pris en charge. Utilisez un CSV UTF-8.");
      return;
    }
    if (file.size > 2_000_000) {
      setMessage("Le fichier dépasse 2 Mo. Découpez-le en plusieurs imports.");
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("Le fichier est vide.");
      setFileName(file.name.slice(0, 240));
      setCsv(text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lecture du fichier impossible.");
    }
  }

  async function createPreview(reuseJob = false) {
    if (!organizationId || !fileName || !csv) {
      setMessage("Choisissez d’abord un fichier CSV.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await previewImport({
        organizationId,
        fileName,
        sourceSystem: source,
        entityType: entityChoice === "auto" ? undefined : entityChoice,
        csv,
        mapping: reuseJob ? mapping : undefined,
        jobId: reuseJob ? preview?.job.id : undefined,
      });
      setPreview(response);
      setMapping(response.mapping);
      setEntityChoice(response.job.entity_type);
      setConfirmed(false);
      setStep("review");
      void refreshHistory(organizationId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prévisualisation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function executeImport() {
    if (!preview || !confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await commitImport({
        organizationId,
        jobId: preview.job.id,
        duplicateStrategy,
      });
      setResult(response.result);
      setStep("done");
      setConfirmed(false);
      window.dispatchEvent(new CustomEvent("manufeo:workspace-changed", { detail: { source: "import", jobId: preview.job.id } }));
      void refreshHistory(organizationId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function executeRollback(jobId: string) {
    if (rollbackConfirmId !== jobId) {
      setRollbackConfirmId(jobId);
      return;
    }
    setHistoryBusy(true);
    setMessage("");
    try {
      const response = await rollbackImport({ organizationId, jobId });
      const rolledBack = Number(response.result.rolledBack ?? 0);
      const blocked = Number(response.result.blocked ?? 0);
      setMessage(blocked > 0
        ? `${rolledBack} élément(s) annulé(s). ${blocked} élément(s) conservé(s) car modifiés ou déjà utilisés.`
        : `${rolledBack} élément(s) annulé(s) proprement.`);
      setRollbackConfirmId(null);
      await refreshHistory(organizationId);
      window.dispatchEvent(new CustomEvent("manufeo:workspace-changed", { detail: { source: "import-rollback", jobId } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rollback impossible.");
    } finally {
      setHistoryBusy(false);
    }
  }

  if (!open) return null;

  const counters = preview?.counters;
  const canImport = Boolean(preview && counters && counters.valid + (duplicateStrategy === "create" ? counters.duplicates : 0) > 0 && confirmed && !busy);

  return (
    <div className="mic-overlay" role="dialog" aria-modal="true" aria-label="Centre d’import MANUFEO">
      <section className="mic-panel">
        <header className="mic-header">
          <div>
            <small>MIGRATION DES DONNÉES</small>
            <h2>Centre d’import MANUFEO</h2>
            <p>Aperçu, contrôle des doublons, import transactionnel et rollback sécurisé.</p>
          </div>
          <button type="button" className="mic-icon-btn" onClick={close} aria-label="Fermer"><X size={20} /></button>
        </header>

        <div className="mic-scroll">
          <div className="mic-toolbar">
            <div className="mic-tabs">
              <button type="button" className={step !== "history" ? "active" : ""} onClick={() => setStep(preview ? "review" : "upload")}>Nouvel import</button>
              <button type="button" className={step === "history" ? "active" : ""} onClick={() => { setStep("history"); void refreshHistory(organizationId); }}>Historique</button>
            </div>
            {step !== "history" && <button type="button" className="mic-history-link" onClick={() => { setStep("history"); void refreshHistory(organizationId); }}><History size={15} /> Voir les imports</button>}
          </div>

          {message && <div className={`mic-message ${/impossible|invalide|échoué|refus|non pris/i.test(message) ? "error" : ""}`}>{message}</div>}

          {step === "upload" && (
            <div className="mic-grid">
              <section className="mic-card">
                <h3>1. Fichier à migrer</h3>
                <label
                  className={`mic-drop ${dragging ? "dragging" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files?.[0] ?? null); }}
                >
                  <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void readFile(event.target.files?.[0] ?? null)} />
                  <i>{fileName ? <FileSpreadsheet size={27} /> : <UploadCloud size={27} />}</i>
                  <strong>{fileName || "Déposez votre export CSV"}</strong>
                  <span>{fileName ? "Le fichier reste en mémoire le temps de préparer l’import." : "Tolteck, Obat, Costructor, EBP ou export générique. 2 Mo / 5 000 lignes maximum."}</span>
                </label>
                {fileName && <button type="button" className="mic-secondary" onClick={() => fileRef.current?.click()}>Changer de fichier</button>}
              </section>

              <section className="mic-card">
                <h3>2. Source et contenu</h3>
                <p>MANUFEO propose automatiquement le mapping, mais vous gardez la main avant toute écriture.</p>
                <div className="mic-fields">
                  <div className="mic-field"><label>Logiciel source</label><select value={source} onChange={(event) => setSource(event.target.value as ImportSourceSystem)}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
                  <div className="mic-field"><label>Type de données</label><select value={entityChoice} onChange={(event) => setEntityChoice(event.target.value as EntityChoice)}><option value="auto">Détection automatique</option><option value="customers">Clients</option><option value="catalog">Catalogue / prestations</option></select></div>
                </div>
                <div className="mic-message">Excel XLS/XLSX : exportez d’abord en <strong>CSV UTF-8</strong>. Cela évite d’introduire un parseur XLSX vulnérable dans le produit.</div>
                <button type="button" className="mic-primary" disabled={!fileName || busy} onClick={() => void createPreview(false)}>{busy ? <Loader2 size={16} className="mic-spin" /> : <Database size={16} />} Analyser le fichier</button>
              </section>
            </div>
          )}

          {step === "review" && preview && (
            <>
              <section className="mic-card">
                <div><h3>Mapping des colonnes</h3><p>Modifiez les correspondances si MANUFEO a mal interprété une colonne, puis recalculez l’aperçu.</p></div>
                <div className="mic-mapping">
                  {preview.fields.map((field) => (
                    <div key={field.key}>
                      <label>{field.label}</label>
                      <select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}>
                        <option value="">Ne pas importer</option>
                        {preview.headers.map((header) => <option value={header} key={header}>{header}</option>)}
                      </select>
                      {field.required && !mapping[field.key] && <small>Champ requis</small>}
                    </div>
                  ))}
                </div>
                <div className="mic-actions">
                  <button type="button" className="mic-secondary" disabled={busy} onClick={() => void createPreview(true)}>{busy ? <Loader2 size={15} className="mic-spin" /> : <RefreshCw size={15} />} Recalculer l’aperçu</button>
                  <button type="button" className="mic-secondary" disabled={busy} onClick={reset}>Changer de fichier</button>
                </div>
              </section>

              <div className="mic-summary">
                <div className="mic-stat"><strong>{counters?.total ?? 0}</strong><span>Lignes</span></div>
                <div className="mic-stat valid"><strong>{counters?.valid ?? 0}</strong><span>Valides</span></div>
                <div className="mic-stat duplicate"><strong>{counters?.duplicates ?? 0}</strong><span>Doublons</span></div>
                <div className="mic-stat invalid"><strong>{counters?.invalid ?? 0}</strong><span>Invalides</span></div>
              </div>

              <section className="mic-card">
                <div><h3>Aperçu des données</h3><p>{entityLabel(preview.job.entity_type)} · {SOURCE_LABELS[preview.job.source_system]} · séparateur {preview.delimiter === "tab" ? "tabulation" : `« ${preview.delimiter} »`}</p></div>
                <div className="mic-table-wrap">
                  <table className="mic-table">
                    <thead><tr><th>#</th><th>État</th><th>{preview.job.entity_type === "catalog" ? "Désignation" : "Client"}</th><th>{preview.job.entity_type === "catalog" ? "Prix HT" : "SIRET / e-mail"}</th><th>Détail</th></tr></thead>
                    <tbody>
                      {preview.sample.map((row) => {
                        const data = row.normalizedData;
                        const name = preview.job.entity_type === "catalog"
                          ? displayCell(data.label)
                          : displayCell(data.company_name || [data.last_name, data.first_name].filter(Boolean).join(" "));
                        const secondary = preview.job.entity_type === "catalog"
                          ? displayCell(data.unit_price)
                          : displayCell(data.siret || data.email);
                        return <tr key={row.rowIndex}><td>{row.rowIndex}</td><td><span className={`mic-status ${row.status}`}>{row.status === "valid" ? "Valide" : row.status === "duplicate" ? "Doublon" : "Invalide"}</span></td><td>{name}</td><td>{secondary}</td><td>{row.duplicateReason || (row.validationErrors.length ? row.validationErrors.join(" · ") : "Prêt à importer")}{row.validationErrors.map((item) => <span className="mic-row-error" key={item}>{item}</span>)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mic-card">
                <h3>Traitement des doublons</h3>
                <div className="mic-fields">
                  <label className="mic-confirm"><input type="radio" name="duplicate" checked={duplicateStrategy === "skip"} onChange={() => setDuplicateStrategy("skip")} /><span><strong>Ignorer les doublons — recommandé</strong><small>Les lignes déjà présentes restent intactes.</small></span></label>
                  <label className="mic-confirm"><input type="radio" name="duplicate" checked={duplicateStrategy === "create"} onChange={() => setDuplicateStrategy("create")} /><span><strong>Créer quand même</strong><small>Autorise les doublons métier, sauf un identifiant source déjà importé.</small></span></label>
                </div>
                <label className="mic-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>J’ai vérifié l’aperçu et je confirme l’import</strong><small>L’import est transactionnel. En cas d’erreur technique, aucune ligne du lot n’est conservée.</small></span></label>
                <button type="button" className="mic-primary" disabled={!canImport} onClick={() => void executeImport()}>{busy ? <Loader2 size={16} className="mic-spin" /> : <ShieldCheck size={16} />} Importer dans MANUFEO</button>
              </section>
            </>
          )}

          {step === "done" && result && (
            <section className="mic-card mic-done">
              <i><CheckCircle2 size={31} /></i>
              <h3>Import terminé.</h3>
              <p>Le lot a été validé par PostgreSQL en une seule transaction. Le lien avec la source est conservé pour éviter les réimports accidentels.</p>
              <div className="mic-report"><div><strong>{displayCell(result.imported)}</strong><span>éléments importés</span></div><div><strong>{displayCell(result.skipped)}</strong><span>lignes ignorées</span></div></div>
              <div className="mic-actions"><button type="button" className="mic-secondary" onClick={() => { reset(); void refreshHistory(organizationId); }}>Nouvel import</button><button type="button" className="mic-primary" onClick={() => { setStep("history"); void refreshHistory(organizationId); }}><History size={16} /> Voir l’historique</button></div>
            </section>
          )}

          {step === "history" && (
            <section className="mic-card">
              <div><h3>Historique des imports</h3><p>Les imports terminés peuvent être annulés tant que les données créées n’ont pas été modifiées ou utilisées ailleurs.</p></div>
              {historyBusy && !history.length ? <div className="mic-empty"><Loader2 size={20} className="mic-spin" /> Chargement…</div> : (
                <div className="mic-history">
                  {!history.length && <div className="mic-empty">Aucun import enregistré pour cette entreprise.</div>}
                  {history.map((job) => {
                    const rollbackable = ["completed", "rollback_partial"].includes(job.status);
                    return <article className="mic-history-item" key={job.id}><div className="mic-history-main"><strong>{job.file_name}</strong><small>{entityLabel(job.entity_type)} · {SOURCE_LABELS[job.source_system]} · {new Date(job.created_at).toLocaleString("fr-FR")}</small></div><div className="mic-history-actions"><span className={`mic-status ${job.status}`}>{statusLabel(job.status)}</span>{rollbackable && <button type="button" className={rollbackConfirmId === job.id ? "mic-danger" : "mic-secondary"} disabled={historyBusy} onClick={() => void executeRollback(job.id)}>{rollbackConfirmId === job.id ? <><AlertTriangle size={14} /> Confirmer l’annulation</> : <><RotateCcw size={14} /> Annuler l’import</>}</button>}</div></article>;
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
