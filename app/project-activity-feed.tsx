"use client";

import {
  Check,
  Circle,
  Clock3,
  FileText,
  Image as ImageIcon,
  ListTodo,
  Mic,
  Paperclip,
  Pencil,
  Pin,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrganizationRole } from "@/lib/pilot-operations";
import {
  MAX_ACTIVITY_ATTACHMENTS,
  MAX_ACTIVITY_ATTACHMENT_BYTES,
  canCompleteActivityTask,
  canManageActivityContent,
  isAllowedActivityAttachment,
  normalizeActivityTags,
} from "@/lib/project-activity";
import { supabase } from "@/lib/supabase";
import styles from "./project-activity-feed.module.css";

type ProjectOption = { id: string; name: string };
type TeamMember = {
  userId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: string;
  current: boolean;
};

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string;
  created_at: string;
  signed_url: string | null;
};

type ActivityItem = {
  id: string;
  project_id: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  kind: "note" | "task";
  status: "open" | "done";
  due_at: string | null;
  pinned: boolean;
  mentions: string[];
  tags: string[];
  source: "manual" | "voice";
  edited_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  attachments: Attachment[];
};

type EditState = {
  id: string;
  body: string;
  tags: string;
  mentions: string[];
  dueAt: string;
};

type Props = {
  currentUserId: string;
  role: OrganizationRole;
  projects: ProjectOption[];
  members: TeamMember[];
};

type VoiceState = "idle" | "recording" | "transcribing" | "ready";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expirée.");
  return token;
}

async function apiJson<T>(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? "Action impossible."));
  return payload as T;
}

async function apiForm<T>(path: string, form: FormData, method = "POST") {
  const token = await accessToken();
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? "Envoi impossible."));
  return payload as T;
}

export default function ProjectActivityFeed({ currentUserId, role, projects, members }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const [kind, setKind] = useState<"note" | "task">("note");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "note" | "task">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "done">("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  useEffect(() => {
    if (!projects.length) {
      setProjectId("");
      return;
    }
    if (!projectId || !projects.some((project) => project.id === projectId)) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const notify = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 3200);
  }, []);

  const load = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const payload = await apiJson<{ items: ActivityItem[] }>(
        `/api/project-activity?projectId=${encodeURIComponent(projectId)}`,
      );
      setItems(payload.items ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [projectId, notify]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr-FR");
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (statusFilter !== "all" && item.kind === "task" && item.status !== statusFilter) return false;
      if (statusFilter !== "all" && item.kind !== "task") return false;
      if (pinnedOnly && !item.pinned) return false;
      if (!needle) return true;
      const people = item.mentions.map((id) => memberById.get(id)?.name ?? "").join(" ");
      return `${item.body} ${item.tags.join(" ")} ${people}`
        .toLocaleLowerCase("fr-FR")
        .includes(needle);
    });
  }, [items, kindFilter, statusFilter, pinnedOnly, search, memberById]);

  function toggleMention(id: string, edit = false) {
    if (edit && editing) {
      setEditing({
        ...editing,
        mentions: editing.mentions.includes(id)
          ? editing.mentions.filter((value) => value !== id)
          : [...editing.mentions, id],
      });
      return;
    }
    setMentions((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  function selectFiles(next: File[]) {
    const accepted = next.filter((file) =>
      file.size > 0
      && file.size <= MAX_ACTIVITY_ATTACHMENT_BYTES
      && isAllowedActivityAttachment(file.type, file.name),
    );
    const room = Math.max(0, MAX_ACTIVITY_ATTACHMENTS - (voiceFile ? 1 : 0));
    setFiles(accepted.slice(0, room));
    if (accepted.length !== next.length) {
      notify("Certains fichiers ont été ignorés : format non pris en charge ou taille supérieure à 15 Mo.");
    }
  }

  async function uploadFiles(noteId: string, selected: File[]) {
    let failures = 0;
    for (const file of selected.slice(0, MAX_ACTIVITY_ATTACHMENTS)) {
      const form = new FormData();
      form.append("noteId", noteId);
      form.append("file", file, file.name);
      try {
        await apiForm("/api/project-activity/attachments", form);
      } catch {
        failures += 1;
      }
    }
    return failures;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !body.trim()) return;
    setWorking(true);
    try {
      const payload = await apiJson<{ item: ActivityItem }>("/api/project-activity", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          kind,
          body,
          tags: normalizeActivityTags(tags),
          mentions,
          dueAt: kind === "task" && dueAt ? new Date(dueAt).toISOString() : null,
          pinned,
          source: voiceFile ? "voice" : "manual",
        }),
      });

      const attachments = [voiceFile, ...files].filter((file): file is File => Boolean(file));
      const failures = attachments.length ? await uploadFiles(payload.item.id, attachments) : 0;
      setBody("");
      setTags("");
      setMentions([]);
      setDueAt("");
      setPinned(false);
      setFiles([]);
      setVoiceFile(null);
      setVoiceState("idle");
      setVoiceError("");
      notify(failures ? `Élément ajouté, mais ${failures} fichier(s) n’ont pas pu être envoyé(s).` : kind === "task" ? "Tâche ajoutée au chantier." : "Note ajoutée au chantier.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setWorking(false);
    }
  }

  async function transcribeVoice(file: File) {
    setVoiceState("transcribing");
    setVoiceError("");
    try {
      const token = await accessToken();
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(payload.error ?? "Transcription impossible."));
      const text = String(payload.text ?? "").trim();
      if (text) setBody((current) => current.trim() ? `${current.trim()}\n${text}` : text);
      setVoiceState("ready");
    } catch (error) {
      setVoiceState("ready");
      setVoiceError(error instanceof Error ? error.message : "Transcription impossible.");
    }
  }

  async function finalizeVoice(mimeType: string) {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    const type = mimeType.includes("ogg") ? "audio/ogg" : "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type });
    audioChunksRef.current = [];
    if (!blob.size) {
      setVoiceState("idle");
      setVoiceError("Aucun son n’a été enregistré.");
      return;
    }
    const file = new File([blob], `note-vocale-${Date.now()}.${type === "audio/ogg" ? "ogg" : "webm"}`, { type });
    setVoiceFile(file);
    await transcribeVoice(file);
  }

  async function startVoice() {
    setVoiceError("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("L’enregistrement vocal n’est pas disponible sur ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => { void finalizeVoice(recorder.mimeType); };
      recorder.start();
      setVoiceFile(null);
      setVoiceState("recording");
    } catch {
      setVoiceError("MANUFEO n’a pas pu accéder au micro.");
      setVoiceState("idle");
    }
  }

  function stopVoice() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    setWorking(true);
    try {
      await apiJson("/api/project-activity", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setWorking(false);
    }
  }

  function beginEdit(item: ActivityItem) {
    setEditing({
      id: item.id,
      body: item.body,
      tags: item.tags.join(", "),
      mentions: [...item.mentions],
      dueAt: toDateTimeLocal(item.due_at),
    });
  }

  async function saveEdit(item: ActivityItem) {
    if (!editing || editing.id !== item.id) return;
    await patchItem(item.id, {
      body: editing.body,
      tags: normalizeActivityTags(editing.tags),
      mentions: editing.mentions,
      dueAt: item.kind === "task" && editing.dueAt ? new Date(editing.dueAt).toISOString() : null,
    });
    setEditing(null);
    notify("Élément mis à jour.");
  }

  async function removeItem(item: ActivityItem) {
    if (!window.confirm(`Supprimer définitivement ${item.kind === "task" ? "cette tâche" : "cette note"} et ses fichiers ?`)) return;
    setWorking(true);
    try {
      await apiJson("/api/project-activity", {
        method: "DELETE",
        body: JSON.stringify({ id: item.id }),
      });
      notify("Élément supprimé.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setWorking(false);
    }
  }

  async function addFilesToItem(item: ActivityItem, selected: File[]) {
    if (!selected.length) return;
    setWorking(true);
    try {
      const failures = await uploadFiles(item.id, selected);
      notify(failures ? `${failures} fichier(s) n’ont pas pu être ajouté(s).` : "Pièce(s) jointe(s) ajoutée(s).");
      await load();
    } finally {
      setWorking(false);
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!window.confirm(`Supprimer « ${attachment.file_name} » ?`)) return;
    setWorking(true);
    try {
      await apiJson("/api/project-activity/attachments", {
        method: "DELETE",
        body: JSON.stringify({ id: attachment.id }),
      });
      notify("Pièce jointe supprimée.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setWorking(false);
    }
  }

  if (!projects.length) {
    return <div className={styles.empty}>Créez d’abord un chantier pour utiliser le journal terrain.</div>;
  }

  return <div className={styles.root}>
    {message && <div className={styles.toast} role="status">{message}</div>}

    <section className={styles.composer}>
      <div className={styles.composerHeader}>
        <div>
          <span className={styles.eyebrow}>JOURNAL TERRAIN</span>
          <h3>Notes, tâches, photos et vocal au même endroit</h3>
          <p>Chaque élément est horodaté, partagé à l’équipe et rattaché au chantier.</p>
        </div>
        <button className={styles.iconButton} type="button" onClick={() => void load()} aria-label="Actualiser le journal" disabled={loading}>
          <RefreshCw size={17} className={loading ? styles.spinning : ""}/>
        </button>
      </div>

      <form onSubmit={submit} className={styles.form}>
        <div className={styles.kindSwitch}>
          <button type="button" className={kind === "note" ? styles.kindActive : ""} onClick={() => setKind("note")}><StickyNote size={15}/> Note</button>
          <button type="button" className={kind === "task" ? styles.kindActive : ""} onClick={() => setKind("task")}><ListTodo size={15}/> Tâche</button>
        </div>

        <div className={styles.fieldsGrid}>
          <label className={styles.field}>
            <span>Chantier</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          {kind === "task" && <label className={styles.field}>
            <span>Échéance</span>
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)}/>
          </label>}
        </div>

        <label className={styles.field}>
          <span>{kind === "task" ? "Tâche à réaliser" : "Note chantier"}</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            placeholder={kind === "task" ? "Ex. Reprendre le joint du mur nord avant vendredi…" : "Ex. Client passé sur chantier, peinture validée, prévoir 2 pots supplémentaires…"}
            required
          />
        </label>

        <div className={styles.voiceRow}>
          {voiceState !== "recording" ? <button type="button" className={styles.secondaryButton} onClick={() => void startVoice()} disabled={voiceState === "transcribing" || working}>
            <Mic size={15}/> {voiceState === "transcribing" ? "Transcription…" : voiceFile ? "Refaire le vocal" : "Dicter / note vocale"}
          </button> : <button type="button" className={styles.recordingButton} onClick={stopVoice}>
            <span className={styles.recordingDot}/> Arrêter l’enregistrement
          </button>}
          {voiceFile && <span className={styles.voiceReady}>Audio joint · {formatBytes(voiceFile.size)}</span>}
          {voiceError && <span className={styles.warning}>{voiceError} L’audio reste joignable si l’enregistrement a réussi.</span>}
        </div>

        <div className={styles.fieldsGrid}>
          <label className={styles.field}>
            <span>Tags</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="urgent, matériel, client"/>
          </label>
          <label className={styles.filePicker}>
            <Paperclip size={15}/>
            <span>{files.length ? `${files.length} fichier(s) sélectionné(s)` : "Photos / pièces jointes"}</span>
            <input type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,audio/*" onChange={(event) => {
              selectFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}/>
          </label>
        </div>

        {members.length > 0 && <div className={styles.mentionsBlock}>
          <span>Mentions</span>
          <div className={styles.mentionChoices}>
            {members.map((member) => <button
              key={member.userId}
              type="button"
              aria-pressed={mentions.includes(member.userId)}
              className={mentions.includes(member.userId) ? styles.mentionActive : styles.mentionButton}
              onClick={() => toggleMention(member.userId)}
            >@{member.name}</button>)}
          </div>
        </div>}

        <div className={styles.composerActions}>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)}/>
            <Pin size={14}/> Épingler
          </label>
          <button className={styles.primaryButton} disabled={working || !body.trim()}>
            {kind === "task" ? <ListTodo size={16}/> : <StickyNote size={16}/>} Ajouter au journal
          </button>
        </div>
      </form>
    </section>

    <section className={styles.feedPanel}>
      <div className={styles.filters}>
        <label className={styles.searchBox}><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher dans le chantier…"/></label>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="Filtrer par type">
          <option value="all">Tout</option><option value="note">Notes</option><option value="task">Tâches</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filtrer les tâches par statut">
          <option value="all">Tous statuts</option><option value="open">À faire</option><option value="done">Terminées</option>
        </select>
        <label className={styles.checkLabel}><input type="checkbox" checked={pinnedOnly} onChange={(event) => setPinnedOnly(event.target.checked)}/><Pin size={13}/> Épinglés</label>
      </div>

      {loading ? <div className={styles.empty}>Chargement du journal…</div> : !visibleItems.length ? <div className={styles.empty}>Aucun élément ne correspond à ces filtres.</div> : <div className={styles.timeline}>
        {visibleItems.map((item) => {
          const author = memberById.get(item.created_by)?.name ?? "Membre de l’équipe";
          const canManage = canManageActivityContent(role, currentUserId, item.created_by);
          const canComplete = item.kind === "task" && canCompleteActivityTask(role, currentUserId, item.created_by, item.mentions);
          const isEditing = editing?.id === item.id;
          return <article key={item.id} className={`${styles.activityCard} ${item.pinned ? styles.pinned : ""} ${item.kind === "task" && item.status === "done" ? styles.done : ""}`}>
            <div className={styles.timelineDot}>{item.kind === "task" ? <ListTodo size={14}/> : <StickyNote size={14}/>}</div>
            <div className={styles.cardHeader}>
              <div className={styles.cardIdentity}>
                <span className={`${styles.typeBadge} ${item.kind === "task" ? styles.taskBadge : ""}`}>{item.kind === "task" ? "Tâche" : "Note"}</span>
                {item.source === "voice" && <span className={styles.voiceBadge}><Mic size={11}/> Vocal</span>}
                <strong>{author}</strong>
                <span>{formatDate(item.created_at)}</span>
                {item.edited_at && <span>· modifié {formatDate(item.edited_at)}</span>}
              </div>
              <div className={styles.cardActions}>
                {canManage && <button type="button" className={styles.iconButton} aria-label={item.pinned ? "Désépingler" : "Épingler"} onClick={() => void patchItem(item.id, { pinned: !item.pinned })}><Pin size={15}/></button>}
                {canManage && <button type="button" className={styles.iconButton} aria-label="Modifier" onClick={() => beginEdit(item)}><Pencil size={15}/></button>}
                {canManage && <button type="button" className={`${styles.iconButton} ${styles.dangerIcon}`} aria-label="Supprimer" onClick={() => void removeItem(item)}><Trash2 size={15}/></button>}
              </div>
            </div>

            {item.kind === "task" && <button type="button" className={styles.taskStatus} disabled={!canComplete || working} onClick={() => void patchItem(item.id, { status: item.status === "done" ? "open" : "done" })}>
              {item.status === "done" ? <Check size={17}/> : <Circle size={17}/>}
              <span>{item.status === "done" ? `Terminée${item.completed_at ? ` · ${formatDate(item.completed_at)}` : ""}` : "À faire"}</span>
            </button>}

            {isEditing && editing ? <div className={styles.editBox}>
              <textarea value={editing.body} maxLength={5000} onChange={(event) => setEditing({ ...editing, body: event.target.value })}/>
              <div className={styles.fieldsGrid}>
                <label className={styles.field}><span>Tags</span><input value={editing.tags} onChange={(event) => setEditing({ ...editing, tags: event.target.value })}/></label>
                {item.kind === "task" && <label className={styles.field}><span>Échéance</span><input type="datetime-local" value={editing.dueAt} onChange={(event) => setEditing({ ...editing, dueAt: event.target.value })}/></label>}
              </div>
              <div className={styles.mentionChoices}>{members.map((member) => <button key={member.userId} type="button" className={editing.mentions.includes(member.userId) ? styles.mentionActive : styles.mentionButton} onClick={() => toggleMention(member.userId, true)}>@{member.name}</button>)}</div>
              <div className={styles.editActions}><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}><X size={14}/> Annuler</button><button type="button" className={styles.primaryButton} onClick={() => void saveEdit(item)} disabled={!editing.body.trim() || working}><Check size={14}/> Enregistrer</button></div>
            </div> : <p className={styles.bodyText}>{item.body}</p>}

            <div className={styles.metaRow}>
              {item.due_at && <span className={styles.due}><Clock3 size={13}/> {formatDate(item.due_at)}</span>}
              {item.tags.map((tag) => <button key={tag} type="button" className={styles.tag} onClick={() => setSearch(tag)}>#{tag}</button>)}
              {item.mentions.map((id) => <span key={id} className={styles.mentionPill}>@{memberById.get(id)?.name ?? "membre"}</span>)}
            </div>

            {item.attachments.length > 0 && <div className={styles.attachments}>
              {item.attachments.map((attachment) => {
                const canDeleteAttachment = attachment.created_by === currentUserId || canManage;
                const isImage = attachment.mime_type.startsWith("image/");
                const isAudio = attachment.mime_type.startsWith("audio/");
                return <div key={attachment.id} className={styles.attachmentCard}>
                  {isImage && attachment.signed_url ? <a href={attachment.signed_url} target="_blank" rel="noreferrer"><img src={attachment.signed_url} alt={attachment.file_name}/></a> : isAudio && attachment.signed_url ? <audio controls preload="metadata" src={attachment.signed_url}/> : <a className={styles.fileLink} href={attachment.signed_url ?? undefined} target="_blank" rel="noreferrer"><FileText size={20}/><span>{attachment.file_name}</span></a>}
                  <div className={styles.attachmentMeta}>{isImage ? <ImageIcon size={12}/> : <Paperclip size={12}/>}<span>{attachment.file_name}</span><span>{formatBytes(Number(attachment.size_bytes))}</span>{canDeleteAttachment && <button type="button" aria-label={`Supprimer ${attachment.file_name}`} onClick={() => void removeAttachment(attachment)}><Trash2 size={12}/></button>}</div>
                </div>;
              })}
            </div>}

            <div className={styles.cardFooter}>
              <label className={styles.inlineFilePicker}><Paperclip size={14}/> Ajouter fichier<input type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,audio/*" onChange={(event) => {
                const selected = Array.from(event.currentTarget.files ?? []).filter((file) => file.size <= MAX_ACTIVITY_ATTACHMENT_BYTES && isAllowedActivityAttachment(file.type, file.name));
                void addFilesToItem(item, selected);
                event.currentTarget.value = "";
              }}/></label>
              <span>{item.attachments.length}/{MAX_ACTIVITY_ATTACHMENTS} fichiers</span>
            </div>
          </article>;
        })}
      </div>}
    </section>
  </div>;
}
