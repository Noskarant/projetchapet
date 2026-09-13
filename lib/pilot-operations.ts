export type OrganizationRole = "owner" | "admin" | "office" | "manager" | "worker" | "accountant";

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  office: "Bureau",
  manager: "Chef d’équipe",
  worker: "Salarié terrain",
  accountant: "Comptable",
};

export const INVITABLE_ROLES: OrganizationRole[] = ["admin", "office", "manager", "worker", "accountant"];

export const ROLE_DESCRIPTIONS: Record<OrganizationRole, string> = {
  owner: "Accès total, équipe et paramètres sensibles.",
  admin: "Accès total à l’exploitation et gestion de l’équipe.",
  office: "Clients, devis, factures, commandes et suivi administratif.",
  manager: "Pilotage opérationnel, chantiers, équipe et commandes.",
  worker: "Accès opérationnel aux chantiers, notes et photos.",
  accountant: "Consultation comptable et factures.",
};

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === "string" && value in ROLE_LABELS;
}

export function isInvitableRole(value: unknown): value is Exclude<OrganizationRole, "owner"> {
  return isOrganizationRole(value) && value !== "owner";
}

export function canManageTeam(role: OrganizationRole) {
  return role === "owner" || role === "admin";
}

export function canManageSupplierOrders(role: OrganizationRole) {
  return role === "owner" || role === "admin" || role === "office" || role === "manager";
}

export function canSignDocuments(role: OrganizationRole) {
  return role === "owner" || role === "admin" || role === "office" || role === "manager";
}

export function supplierOrderTotal(quantity: number, unitPrice: number) {
  const quantityValue = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  const priceValue = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  return Math.round(quantityValue * priceValue * 100) / 100;
}
