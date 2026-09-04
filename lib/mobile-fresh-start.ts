import type { MobileWorkspace } from "./mobile-prototype";
import { MOBILE_WORKSPACE_STORAGE_KEY, prepareMobileWorkspaceStorage } from "./mobile-workspace-storage";

const FRESH_START_MARKER = "projetchapet:fresh-start:2026-09-v1";
const BACKUP_PREFIX = "projetchapet:backup-before-fresh-start";
const PROJECT_ACTUALS_KEY = "forgeo:project-actuals:v1";

export const EMPTY_MOBILE_WORKSPACE: MobileWorkspace = {
  customers: [],
  quotes: [],
  invoices: [],
  agenda: [],
};

type FreshStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type FreshStartResult = "already_applied" | "reset";

export function prepareFreshArtisanStart(storage: FreshStorage, now = Date.now()): FreshStartResult {
  if (storage.getItem(FRESH_START_MARKER) === "done") {
    prepareMobileWorkspaceStorage(storage, EMPTY_MOBILE_WORKSPACE);
    return "already_applied";
  }

  const currentWorkspace = storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY);
  if (currentWorkspace) storage.setItem(`${BACKUP_PREFIX}-${now}`, currentWorkspace);

  const actuals = storage.getItem(PROJECT_ACTUALS_KEY);
  if (actuals) storage.setItem(`${BACKUP_PREFIX}-actuals-${now}`, actuals);

  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(EMPTY_MOBILE_WORKSPACE));
  storage.removeItem(PROJECT_ACTUALS_KEY);
  storage.setItem(FRESH_START_MARKER, "done");
  return "reset";
}
