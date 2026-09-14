import { supabase } from "@/lib/supabase";
import type { ImportEntityType, ImportFieldDefinition, ImportSourceSystem } from "@/lib/import-migration";

export type ImportSampleRow = {
  rowIndex: number;
  normalizedData: Record<string, unknown>;
  validationErrors: string[];
  status: "valid" | "invalid" | "duplicate";
  duplicateOf: string | null;
  duplicateReason: string | null;
};

export type ImportPreviewResponse = {
  job: {
    id: string;
    file_name: string;
    source_system: ImportSourceSystem;
    entity_type: ImportEntityType;
    status: string;
    mapping: Record<string, string>;
    counters: Record<string, number>;
    created_at: string;
  };
  delimiter: string;
  headers: string[];
  fields: ImportFieldDefinition[];
  mapping: Record<string, string>;
  counters: { total: number; valid: number; invalid: number; duplicates: number };
  sample: ImportSampleRow[];
};

export type ImportHistoryJob = {
  id: string;
  file_name: string;
  source_system: ImportSourceSystem;
  entity_type: ImportEntityType;
  status: string;
  counters: Record<string, number>;
  created_at: string;
  committed_at: string | null;
  updated_at: string;
  error_message: string | null;
};

async function token() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error("Votre session a expiré. Reconnectez-vous.");
  return accessToken;
}

async function authenticatedJson<T>(url: string, init: RequestInit): Promise<T> {
  const accessToken = await token();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Opération d’import impossible.");
  return body as T;
}

export function previewImport(input: {
  organizationId: string;
  fileName: string;
  sourceSystem: ImportSourceSystem;
  entityType?: ImportEntityType;
  csv: string;
  mapping?: Record<string, string>;
  jobId?: string;
}) {
  return authenticatedJson<ImportPreviewResponse>("/api/import/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function commitImport(input: {
  organizationId: string;
  jobId: string;
  duplicateStrategy: "skip" | "create";
}) {
  return authenticatedJson<{ result: Record<string, unknown> }>("/api/import/commit", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
}

export function rollbackImport(input: { organizationId: string; jobId: string }) {
  return authenticatedJson<{ result: Record<string, unknown> }>("/api/import/rollback", {
    method: "POST",
    body: JSON.stringify({ ...input, confirmed: true }),
  });
}

export async function fetchImportHistory(organizationId: string) {
  const accessToken = await token();
  const response = await fetch(`/api/import/jobs?organizationId=${encodeURIComponent(organizationId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Historique indisponible.");
  return (body.jobs ?? []) as ImportHistoryJob[];
}
