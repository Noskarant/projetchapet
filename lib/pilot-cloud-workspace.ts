import {
  COMPANY_PROFILE_STORAGE_KEY,
  normalizeCompanyProfile,
  type CompanyProfile,
} from "./company-profile";
import { EMPTY_MOBILE_WORKSPACE } from "./mobile-fresh-start";
import {
  MOBILE_WORKSPACE_STORAGE_KEY,
  normalizeMobileWorkspace,
} from "./mobile-workspace-storage";
import type { MobileWorkspace } from "./mobile-prototype";

export const PILOT_SNAPSHOT_SCHEMA_VERSION = 1;
export const PILOT_SYNC_STATE_KEY = "forgeo:pilot-cloud-sync:v1";

export type PilotLocalSnapshot = {
  workspace: MobileWorkspace;
  companyProfile: CompanyProfile;
};

export type PilotSyncState = {
  organizationId: string;
  dirty: boolean;
  signature: string;
  updatedAt: string;
};

type PilotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function normalizePilotSnapshot(workspace: unknown, companyProfile: unknown): PilotLocalSnapshot {
  return {
    workspace: normalizeMobileWorkspace(workspace, EMPTY_MOBILE_WORKSPACE),
    companyProfile: normalizeCompanyProfile(companyProfile),
  };
}

export function readPilotLocalSnapshot(storage: PilotStorage): PilotLocalSnapshot {
  return normalizePilotSnapshot(
    parseJson(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY)),
    parseJson(storage.getItem(COMPANY_PROFILE_STORAGE_KEY)),
  );
}

export function writePilotLocalSnapshot(storage: PilotStorage, snapshot: PilotLocalSnapshot) {
  const normalized = normalizePilotSnapshot(snapshot.workspace, snapshot.companyProfile);
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(normalized.workspace));
  storage.setItem(COMPANY_PROFILE_STORAGE_KEY, JSON.stringify(normalized.companyProfile));
  return normalized;
}

export function clearPilotLocalSnapshot(storage: PilotStorage) {
  storage.removeItem(MOBILE_WORKSPACE_STORAGE_KEY);
  storage.removeItem(COMPANY_PROFILE_STORAGE_KEY);
  storage.removeItem(PILOT_SYNC_STATE_KEY);
}

export function pilotStorageSignature(storage: Pick<Storage, "getItem">) {
  return JSON.stringify([
    storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) ?? "",
    storage.getItem(COMPANY_PROFILE_STORAGE_KEY) ?? "",
  ]);
}

export function readPilotSyncState(storage: Pick<Storage, "getItem">): PilotSyncState | null {
  const value = parseJson(storage.getItem(PILOT_SYNC_STATE_KEY));
  if (!isRecord(value)) return null;
  if (typeof value.organizationId !== "string" || !value.organizationId) return null;
  if (typeof value.dirty !== "boolean" || typeof value.signature !== "string") return null;
  return {
    organizationId: value.organizationId,
    dirty: value.dirty,
    signature: value.signature,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function writePilotSyncState(
  storage: Pick<Storage, "setItem">,
  organizationId: string,
  signature: string,
  dirty: boolean,
) {
  const state: PilotSyncState = {
    organizationId,
    dirty,
    signature,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(PILOT_SYNC_STATE_KEY, JSON.stringify(state));
  return state;
}

export function markPilotSnapshotDirty(
  storage: Pick<Storage, "setItem">,
  organizationId: string,
  signature: string,
) {
  return writePilotSyncState(storage, organizationId, signature, true);
}

export function markPilotSnapshotSynced(
  storage: Pick<Storage, "setItem">,
  organizationId: string,
  signature: string,
) {
  return writePilotSyncState(storage, organizationId, signature, false);
}

export function shouldPreferLocalPilotSnapshot(
  syncState: PilotSyncState | null,
  organizationId: string,
) {
  return Boolean(syncState?.dirty && syncState.organizationId === organizationId);
}
