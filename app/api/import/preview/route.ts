import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import {
  buildImportPreview,
  type ImportEntityType,
  type ImportSourceSystem,
} from "@/lib/import-migration";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

export const runtime = "nodejs";

const SOURCES: ImportSourceSystem[] = ["generic", "tolteck", "obat", "costructor", "ebp", "other"];
const ENTITY_TYPES: ImportEntityType[] = ["customers", "catalog"];

function cleanSource(value: unknown): ImportSourceSystem {
  return SOURCES.includes(value as ImportSourceSystem) ? value as ImportSourceSystem : "generic";
}

function cleanEntityType(value: unknown): ImportEntityType | undefined {
  return ENTITY_TYPES.includes(value as ImportEntityType) ? value as ImportEntityType : undefined;
}

function cleanFileName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new ApiInputError("Nom du fichier requis.");
  return value.trim().slice(0, 240);
}

function cleanOrganizationId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new ApiInputError("Entreprise requise.");
  return value.trim();
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "import-preview", 8);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      organizationId?: unknown;
      fileName?: unknown;
      sourceSystem?: unknown;
      entityType?: unknown;
      csv?: unknown;
    }>(request, 2_200_000);

    const organizationId = cleanOrganizationId(body.organizationId);
    const fileName = cleanFileName(body.fileName);
    const sourceSystem = cleanSource(body.sourceSystem);
    const requestedType = cleanEntityType(body.entityType);
    if (typeof body.csv !== "string" || !body.csv.trim()) throw new ApiInputError("Fichier CSV vide.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin"]);

    let preview;
    try {
      preview = buildImportPreview(body.csv, requestedType);
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "Fichier illisible.");
    }

    const duplicateBySiret = new Map<string, string>();
    const duplicateByEmail = new Map<string, string>();
    if (preview.entityType === "customers") {
      const { data: customers, error: customersError } = await context.client
        .from("customers")
        .select("id, siret, emails")
        .eq("organization_id", organizationId)
        .limit(10000);
      if (customersError) throw new Error("Impossible de contrôler les doublons clients.");
      for (const customer of customers ?? []) {
        const id = String(customer.id);
        const siret = String(customer.siret ?? "").replace(/\D/g, "");
        if (siret) duplicateBySiret.set(siret, id);
        for (const email of Array.isArray(customer.emails) ? customer.emails : []) {
          const normalized = String(email).trim().toLowerCase();
          if (normalized) duplicateByEmail.set(normalized, id);
        }
      }
    }

    const staged = preview.rows.map((row) => {
      const normalized = row.normalizedData as Record<string, unknown>;
      const siret = String(normalized.siret ?? "").replace(/\D/g, "");
      const email = String(normalized.email ?? "").trim().toLowerCase();
      const duplicateOf = preview.entityType === "customers"
        ? (siret && duplicateBySiret.get(siret)) || (email && duplicateByEmail.get(email)) || null
        : null;
      const status = row.validationErrors.length ? "invalid" : duplicateOf ? "duplicate" : "valid";
      return { ...row, duplicateOf, status };
    });

    const counters = {
      total: staged.length,
      valid: staged.filter((row) => row.status === "valid").length,
      invalid: staged.filter((row) => row.status === "invalid").length,
      duplicates: staged.filter((row) => row.status === "duplicate").length,
    };

    const { data: job, error: jobError } = await context.client
      .from("import_jobs")
      .insert({
        organization_id: organizationId,
        created_by: context.user.id,
        file_name: fileName,
        source_system: sourceSystem,
        entity_type: preview.entityType,
        status: "preview",
        mapping: preview.mapping,
        counters,
      })
      .select("id, organization_id, file_name, source_system, entity_type, status, mapping, counters, created_at")
      .single();
    if (jobError || !job) throw new Error("La prévisualisation n’a pas pu être créée.");

    for (let offset = 0; offset < staged.length; offset += 250) {
      const chunk = staged.slice(offset, offset + 250).map((row) => ({
        job_id: job.id,
        organization_id: organizationId,
        row_index: row.rowIndex,
        entity_type: preview.entityType,
        source_id: row.sourceId,
        raw_data: row.rawData,
        normalized_data: row.normalizedData,
        validation_errors: row.validationErrors,
        status: row.status,
        duplicate_of: row.duplicateOf,
      }));
      const { error } = await context.client.from("import_staging_rows").insert(chunk);
      if (error) {
        await context.client.from("import_jobs").update({ status: "failed", error_message: "Échec de mise en staging." }).eq("id", job.id);
        throw new Error("La mise en staging de l’import a échoué.");
      }
    }

    return NextResponse.json({
      job,
      delimiter: preview.delimiter === "\t" ? "tab" : preview.delimiter,
      headers: preview.headers,
      mapping: preview.mapping,
      counters,
      sample: staged.slice(0, 20).map((row) => ({
        rowIndex: row.rowIndex,
        normalizedData: row.normalizedData,
        validationErrors: row.validationErrors,
        status: row.status,
        duplicateOf: row.duplicateOf,
      })),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Prévisualisation de l’import impossible.");
  }
}
