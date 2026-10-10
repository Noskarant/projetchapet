import type { SupabaseClient } from "@supabase/supabase-js";
import { isDatabaseId } from "./mobile-desktop-sync";
import { CUSTOMER_DOCUMENTS_DELETE_ERROR, deleteCustomerFromWorkspace, type MobileWorkspace } from "./mobile-prototype";
import type { WorkspaceFlushScope } from "./mobile-workspace-flush";

/** The database also protects documents absent from the active local list (archives). */
export async function deleteCustomerRecord(client: SupabaseClient, id: string, organizationId: string) {
  const { data, error } = await client.from("customers").delete()
    .eq("id", id).eq("organization_id", organizationId).select("id");
  if (error) {
    if (error.code === "23503") throw new Error(CUSTOMER_DOCUMENTS_DELETE_ERROR);
    if (error.code === "42501") throw new Error("Vous n’avez pas les droits nécessaires pour supprimer ce client.");
    throw new Error("La suppression du client a échoué. Vérifiez votre connexion et réessayez.");
  }
  if (!data || data.length !== 1 || data[0].id !== id) {
    throw new Error("La suppression n’a pas été confirmée. Actualisez la liste et vérifiez vos droits.");
  }
}

/** Resolve pending mobile IDs before deleting; never remove the local card on failure. */
export async function deleteSyncedMobileCustomer(options: {
  id: string;
  readWorkspace: () => MobileWorkspace;
  resolveId: (id: string) => string;
  flush: (scope: WorkspaceFlushScope) => Promise<void>;
  removeCloud: (id: string) => Promise<void>;
  commit: (id: string) => void;
}) {
  const before = options.readWorkspace();
  const initialId = options.resolveId(options.id);
  if (!before.customers.some(customer => customer.id === initialId)) throw new Error("Ce client est introuvable. Actualisez la liste.");
  deleteCustomerFromWorkspace(before, initialId); // Check links before any network write.
  await options.flush({ entity: "customer", id: initialId });
  const id = options.resolveId(initialId);
  const latest = options.readWorkspace();
  if (!isDatabaseId(id) || !latest.customers.some(customer => customer.id === id)) {
    throw new Error("La sauvegarde du client est encore en attente. Réessayez sans fermer cet écran.");
  }
  deleteCustomerFromWorkspace(latest, id);
  await options.removeCloud(id);
  options.commit(id);
}
