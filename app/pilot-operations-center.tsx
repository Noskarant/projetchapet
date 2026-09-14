"use client";

import {
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  PenLine,
  Plus,
  Send,
  ShoppingCart,
  StickyNote,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ensurePilotOrganization } from "@/lib/pilot-cloud";
import { readCommercialDemoState } from "@/lib/mobile-commercial-demo";
import { readPilotLocalSnapshot } from "@/lib/pilot-cloud-workspace";
import {
  canManageSupplierOrders,
  canManageTeam,
  canSignDocuments,
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  supplierOrderTotal,
  type OrganizationRole,
} from "@/lib/pilot-operations";
import { supabase } from "@/lib/supabase";
import ProjectActivityFeed from "./project-activity-feed";
import styles from "./pilot-operations-center.module.css";

type Tab = "team" | "notes" | "signatures" | "orders";
type TeamMember = {
  userId: string;
  email: string;
  name: string;
  role: OrganizationRole;
  joinedAt: string;
  current: boolean;
};
type Invitation = { id: string; email: string; role: OrganizationRole; created_at: string };
type Signature = {
  id: string;
  document_kind: "quote" | "invoice";
  document_number: string;
  signer_name: string;
  signer_email: string;
  document_hash: string;
  signed_at: string;
};
type SupplierOrder = {
  id: string;
  project_id: string | null;
  supplier_name: string;
  supplier_email: string;
  label: string;
  quantity: number;
  unit_price: number;
  notes: string;
  status: "draft" | "approved" | "sent" | "cancelled";
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};
type ProjectOption = { id: string; name: string };
type DocumentOption = { kind: "quote" | "invoice"; number: string; label: string };

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";
const euro = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
}).format(value);

async function authenticatedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expirée.");
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
  return payload;
}

export default function PilotOperationsCenter() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("team");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<OrganizationRole>("worker");
  const [organizationName, setOrganizationName] = useState("Mon entreprise");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<OrganizationRole, "owner">>("worker");
  const [signDocument, setSignDocument] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signConsent, setSignConsent] = useState(false);
  const [orderDraft, setOrderDraft] = useState({
    projectId: "",
    supplierName: "",
    supplierEmail: "",
    label: "",
    quantity: "1",
    unitPrice: "0",
    notes: "",
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setVisible(Boolean(data.session?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) =>
      setVisible(Boolean(session?.user)),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Session expirée.");
      const organization = await ensurePilotOrganization(auth.user.id);
      setOrganizationId(organization.id);
      setUserId(auth.user.id);
      setRole((organization.role || "worker") as OrganizationRole);
      setOrganizationName(organization.name);

      const localCommercial = readCommercialDemoState(window.localStorage);
      const localSnapshot = readPilotLocalSnapshot(window.localStorage);
      const projectOptions = localCommercial.projects.map((project) => ({
        id: project.id,
        name: project.name,
      }));
      setProjects(projectOptions);
      if (!orderDraft.projectId && projectOptions[0]) {
        setOrderDraft((value) => ({ ...value, projectId: projectOptions[0].id }));
      }

      const documentOptions: DocumentOption[] = [
        ...localSnapshot.workspace.quotes.map((document) => ({
          kind: "quote" as const,
          number: document.number,
          label: `${document.number} · ${document.customerName}`,
        })),
        ...localSnapshot.workspace.invoices.map((document) => ({
          kind: "invoice" as const,
          number: document.number,
          label: `${document.number} · ${document.customerName}`,
        })),
      ];
      setDocuments(documentOptions);
      if (!signDocument && documentOptions[0]) {
        setSignDocument(`${documentOptions[0].kind}|${documentOptions[0].number}`);
      }

      const [teamPayload, signaturePayload, ordersResult] = await Promise.all([
        authenticatedFetch("/api/team"),
        authenticatedFetch("/api/signatures"),
        supabase
          .from("supplier_orders")
          .select("id,project_id,supplier_name,supplier_email,label,quantity,unit_price,notes,status,created_at,approved_at,sent_at")
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (ordersResult.error) throw ordersResult.error;
      setMembers((teamPayload.members ?? []) as TeamMember[]);
      setInvitations((teamPayload.invitations ?? []) as Invitation[]);
      setSignatures((signaturePayload.signatures ?? []) as Signature[]);
      setOrders((ordersResult.data ?? []) as SupplierOrder[]);
      setRole((teamPayload.currentRole ?? organization.role ?? "worker") as OrganizationRole);
      setOrganizationName(String(teamPayload.organizationName ?? organization.name));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  }, [orderDraft.projectId, signDocument, notify]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const projectName = useCallback(
    (id: string | null) => projects.find((project) => project.id === id)?.name ?? id ?? "Sans chantier",
    [projects],
  );
  const teamAllowed = canManageTeam(role);
  const orderAllowed = canManageSupplierOrders(role);
  const signatureAllowed = canSignDocuments(role);
  const pendingOrders = useMemo(
    () => orders.filter((order) => order.status !== "sent" && order.status !== "cancelled").length,
    [orders],
  );

  async function inviteMember(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await authenticatedFetch("/api/team", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail("");
      notify("Invitation envoyée.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Invitation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMemberRole(member: TeamMember, nextRole: OrganizationRole) {
    if (member.current || member.role === "owner") return;
    setBusy(true);
    try {
      await authenticatedFetch("/api/team", {
        method: "PATCH",
        body: JSON.stringify({ userId: member.userId, role: nextRole }),
      });
      notify("Rôle mis à jour.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: TeamMember) {
    if (!window.confirm(`Retirer ${member.name} de ${organizationName} ?`)) return;
    setBusy(true);
    try {
      await authenticatedFetch("/api/team", {
        method: "DELETE",
        body: JSON.stringify({ userId: member.userId }),
      });
      notify("Accès retiré.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelInvitation(invitation: Invitation) {
    setBusy(true);
    try {
      await authenticatedFetch("/api/team", {
        method: "DELETE",
        body: JSON.stringify({ invitationId: invitation.id }),
      });
      notify("Invitation annulée.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Annulation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sign(event: React.FormEvent) {
    event.preventDefault();
    const [documentKind, documentNumber] = signDocument.split("|");
    setBusy(true);
    try {
      await authenticatedFetch("/api/signatures", {
        method: "POST",
        body: JSON.stringify({
          documentKind,
          documentNumber,
          signerName,
          signerEmail,
          consent: signConsent,
        }),
      });
      setSignerName("");
      setSignerEmail("");
      setSignConsent(false);
      notify("Signature enregistrée avec preuve d’audit.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Signature impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const quantity = Number(orderDraft.quantity);
      const unitPrice = Number(orderDraft.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("Quantité ou prix invalide.");
      }
      const { error } = await supabase.from("supplier_orders").insert({
        organization_id: organizationId,
        project_id: orderDraft.projectId || null,
        supplier_name: orderDraft.supplierName.trim(),
        supplier_email: orderDraft.supplierEmail.trim().toLowerCase(),
        label: orderDraft.label.trim(),
        quantity,
        unit_price: unitPrice,
        notes: orderDraft.notes.trim(),
        created_by: userId,
        status: "draft",
      });
      if (error) throw error;
      setOrderDraft((value) => ({
        ...value,
        supplierName: "",
        supplierEmail: "",
        label: "",
        quantity: "1",
        unitPrice: "0",
        notes: "",
      }));
      notify("Commande préparée. Elle n’est pas encore envoyée.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function approveOrder(order: SupplierOrder) {
    if (!window.confirm(`Valider la commande « ${order.label} » pour ${euro(supplierOrderTotal(Number(order.quantity), Number(order.unit_price)))} ?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("supplier_orders")
        .update({
          status: "approved",
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("organization_id", organizationId)
        .eq("status", "draft");
      if (error) throw error;
      notify("Commande validée. Un second geste est requis pour l’envoyer.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Validation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOrder(order: SupplierOrder) {
    if (!window.confirm(`ENVOI RÉEL à ${order.supplier_email}. Confirmer l’envoi de cette commande fournisseur ?`)) return;
    setBusy(true);
    try {
      await authenticatedFetch("/api/supplier-orders/send", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id, confirmed: true }),
      });
      notify("Commande envoyée au fournisseur.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return <>
    <button
      className={styles.launcher}
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Équipe et opérations"
    >
      <BriefcaseBusiness size={20}/><span>Équipe & opérations</span>
    </button>

    {open && <div
      className={styles.backdrop}
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <section className={styles.panel} aria-label="Centre opérations MANUFEO">
        <header className={styles.header}>
          <div><div className={styles.eyebrow}>MANUFEO · PILOTAGE</div><h2>{organizationName}</h2></div>
          <button className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Fermer"><X size={20}/></button>
        </header>

        <nav className={styles.tabs}>
          <button className={tab === "team" ? styles.active : ""} onClick={() => setTab("team")}><UsersRound size={15}/> Équipe</button>
          <button className={tab === "notes" ? styles.active : ""} onClick={() => setTab("notes")}><StickyNote size={15}/> Journal chantier</button>
          <button className={tab === "signatures" ? styles.active : ""} onClick={() => setTab("signatures")}><PenLine size={15}/> Signatures</button>
          <button className={tab === "orders" ? styles.active : ""} onClick={() => setTab("orders")}><ShoppingCart size={15}/> Commandes {pendingOrders ? `(${pendingOrders})` : ""}</button>
        </nav>

        <div className={styles.body}>
          {toast && <div className={styles.toast}>{toast}</div>}
          {busy && <div className={styles.notice}><Loader2 size={14}/> Traitement en cours…</div>}

          {tab === "team" && <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Équipe et permissions</h3>
              <p className={styles.muted}>Votre rôle : <strong>{ROLE_LABELS[role]}</strong>. {ROLE_DESCRIPTIONS[role]}</p>
              <div className={styles.list}>{members.map((member) => <div className={styles.item} key={member.userId}>
                <div className={styles.between}>
                  <div><strong>{member.name}</strong><div className={styles.muted}>{member.email}</div></div>
                  <span className={styles.badge}>{ROLE_LABELS[member.role]}</span>
                </div>
                {teamAllowed && !member.current && member.role !== "owner" && <div className={styles.row} style={{ marginTop: 8 }}>
                  <select value={member.role} onChange={(event) => void updateMemberRole(member, event.target.value as OrganizationRole)}>
                    {INVITABLE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                  </select>
                  <button className={`${styles.button} ${styles.danger}`} onClick={() => void removeMember(member)}><Trash2 size={14}/></button>
                </div>}
              </div>)}</div>
            </div>

            <div className={styles.card}>
              <h3>Inviter un salarié</h3>
              {teamAllowed ? <form className={styles.stack} onSubmit={inviteMember}>
                <label className={styles.field}>E-mail<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required/></label>
                <label className={styles.field}>Rôle<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<OrganizationRole, "owner">)}>{INVITABLE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label>
                <p className={styles.muted}>{ROLE_DESCRIPTIONS[inviteRole]}</p>
                <button className={styles.button} disabled={busy}><Plus size={15}/> Envoyer l’invitation</button>
              </form> : <p className={styles.muted}>Seuls le propriétaire et les administrateurs peuvent gérer les accès.</p>}
              <div className={styles.list} style={{ marginTop: 14 }}>{invitations.map((invite) => <div className={styles.item} key={invite.id}>
                <div className={styles.between}>
                  <div><strong>{invite.email}</strong><div className={styles.muted}>{ROLE_LABELS[invite.role]}</div></div>
                  {teamAllowed && <button className={`${styles.button} ${styles.danger}`} onClick={() => void cancelInvitation(invite)}>Annuler</button>}
                </div>
              </div>)}</div>
            </div>
          </div>}

          {tab === "notes" && <ProjectActivityFeed
            currentUserId={userId}
            role={role}
            projects={projects}
            members={members}
          />}

          {tab === "signatures" && <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Signature électronique simple</h3>
              <p className={styles.muted}>Consentement, horodatage serveur, empreinte SHA-256 du document et trace d’audit. Ce module n’est pas présenté comme une signature qualifiée eIDAS.</p>
              {signatureAllowed ? <form className={styles.stack} onSubmit={sign}>
                <label className={styles.field}>Document<select value={signDocument} onChange={(event) => setSignDocument(event.target.value)} required>{documents.map((document) => <option key={`${document.kind}-${document.number}`} value={`${document.kind}|${document.number}`}>{document.label}</option>)}</select></label>
                <label className={styles.field}>Nom du signataire<input value={signerName} onChange={(event) => setSignerName(event.target.value)} required/></label>
                <label className={styles.field}>E-mail du signataire<input type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} required/></label>
                <label className={styles.check}><input type="checkbox" checked={signConsent} onChange={(event) => setSignConsent(event.target.checked)}/><span>Le signataire confirme avoir lu le document et consent à le signer électroniquement.</span></label>
                <button className={styles.button} disabled={!signConsent || !documents.length || busy}><PenLine size={15}/> Enregistrer la signature</button>
              </form> : <p className={styles.muted}>Votre rôle ne permet pas d’enregistrer une signature.</p>}
            </div>

            <div className={styles.card}>
              <h3>Preuves enregistrées</h3>
              <div className={styles.list}>{signatures.length ? signatures.map((signature) => <div className={styles.item} key={signature.id}>
                <div className={styles.between}><strong>{signature.document_number}</strong><span className={`${styles.badge} ${styles.success}`}><CheckCircle2 size={12}/> Signé</span></div>
                <div>{signature.signer_name} · {signature.signer_email}</div>
                <div className={styles.muted}>{formatDate(signature.signed_at)}</div>
                <div className={styles.footerNote}>Empreinte : {signature.document_hash.slice(0, 16)}…</div>
              </div>) : <div className={styles.empty}>Aucune signature enregistrée.</div>}</div>
            </div>
          </div>}

          {tab === "orders" && <div className={styles.grid}>
            <div className={styles.card}>
              <h3>Préparer une commande fournisseur</h3>
              {orderAllowed ? <form className={styles.stack} onSubmit={createOrder}>
                <label className={styles.field}>Chantier<select value={orderDraft.projectId} onChange={(event) => setOrderDraft({ ...orderDraft, projectId: event.target.value })}><option value="">Sans chantier</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label className={styles.field}>Fournisseur<input value={orderDraft.supplierName} onChange={(event) => setOrderDraft({ ...orderDraft, supplierName: event.target.value })} required/></label>
                <label className={styles.field}>E-mail fournisseur<input type="email" value={orderDraft.supplierEmail} onChange={(event) => setOrderDraft({ ...orderDraft, supplierEmail: event.target.value })} required/></label>
                <label className={styles.field}>Désignation<input value={orderDraft.label} onChange={(event) => setOrderDraft({ ...orderDraft, label: event.target.value })} required/></label>
                <div className={styles.split}>
                  <label className={styles.field}>Quantité<input type="number" min="0.001" step="0.001" value={orderDraft.quantity} onChange={(event) => setOrderDraft({ ...orderDraft, quantity: event.target.value })}/></label>
                  <label className={styles.field}>PU HT<input type="number" min="0" step="0.01" value={orderDraft.unitPrice} onChange={(event) => setOrderDraft({ ...orderDraft, unitPrice: event.target.value })}/></label>
                  <div className={styles.field}>Total<div className={styles.amount}>{euro(supplierOrderTotal(Number(orderDraft.quantity), Number(orderDraft.unitPrice)))}</div></div>
                </div>
                <label className={styles.field}>Notes<textarea value={orderDraft.notes} onChange={(event) => setOrderDraft({ ...orderDraft, notes: event.target.value })}/></label>
                <button className={styles.button} disabled={busy}><Plus size={15}/> Préparer</button>
                <div className={styles.notice}>Préparer ne déclenche aucun envoi. Validation puis confirmation d’envoi sont deux actions distinctes.</div>
              </form> : <p className={styles.muted}>Votre rôle ne permet pas de créer des commandes fournisseurs.</p>}
            </div>

            <div className={styles.card}>
              <h3>Commandes fournisseurs</h3>
              <div className={styles.list}>{orders.length ? orders.map((order) => <div className={styles.item} key={order.id}>
                <div className={styles.between}>
                  <div><strong>{order.label}</strong><div className={styles.muted}>{order.supplier_name} · {projectName(order.project_id)}</div></div>
                  <span className={`${styles.badge} ${order.status === "sent" ? styles.success : order.status === "approved" ? styles.warning : ""}`}>{order.status === "draft" ? "Brouillon" : order.status === "approved" ? "Validée" : order.status === "sent" ? "Envoyée" : "Annulée"}</span>
                </div>
                <div className={styles.between} style={{ marginTop: 8 }}><span>{order.quantity} × {euro(Number(order.unit_price))}</span><strong className={styles.amount}>{euro(supplierOrderTotal(Number(order.quantity), Number(order.unit_price)))}</strong></div>
                {orderAllowed && order.status === "draft" && <button className={`${styles.button} ${styles.secondary}`} style={{ marginTop: 9 }} onClick={() => void approveOrder(order)}><CheckCircle2 size={15}/> Valider humainement</button>}
                {orderAllowed && order.status === "approved" && <button className={styles.button} style={{ marginTop: 9 }} onClick={() => void sendOrder(order)}><Send size={15}/> Envoyer réellement</button>}
                <div className={styles.footerNote}>{formatDate(order.sent_at ?? order.approved_at ?? order.created_at)}</div>
              </div>) : <div className={styles.empty}>Aucune commande fournisseur.</div>}</div>
            </div>
          </div>}
        </div>
      </section>
    </div>}
  </>;
}
