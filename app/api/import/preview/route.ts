import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import {
  buildImportPreview,
  catalogDuplicateKey,
  IMPORT_FIELDS,
  type ImportEntityType,
  type ImportSourceSystem,
} from "@/lib/import-migration";
import { importServiceClient } from "@/lib/import-server";
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

function cleanOptionalId(value: unknown) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

function cleanMapping(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [field, header] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (field.length <= 80 && typeof header === "string" && header.length <= 240) result[field] = header;
  }
  return result;
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
      mapping?: unknown;
      jobId?: unknown;
    }>(request, 2_300_000);

    const organizationId = cleanOrganizationId(body.organizationId);
    const fileName = cleanFileName(body.fileName);
    const sourceSystem = cleanSource(body.sourceSystem);
    const requestedType = cleanEntityType(body.entityType);
    const requestedMapping = cleanMapping(body.mapping);
    const existingJobId = cleanOptionalId(body.jobId);
    if (typeof body.csv !== "string" || !body.csv.trim()) throw new ApiInputError("Fichier CSV vide.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin"]);
    const service = importServiceClient();

    let preview;
    try {
      preview = buildImportPreview(body.csv, requestedType, requestedMapping);
    } catch (error) {
      throw new ApiInputError(error instanceof Error ? error.message : "Fichier illisible.");
    }

    const sourceLinks = new Map<string, string>();
    const { data: linkedRows } = await service
      .from("external_source_links")
      .select("source_id, target_id")
      .eq("organization_id", organizationId)
      .eq("source_system", sourceSystem)
      .eq("entity_type", preview.entityType)
      .limit(10000);
    for (const row of linkedRows ?? []) {
      const sourceId = String(row.source_id ?? "").trim();
      if (sourceId) sourceLinks.set(sourceId, String(row.target_id ?? ""));
    }

    const duplicateBySiret = new Map<string, string>();
    const duplicateByEmail = new Map<string, string>();
    const duplicateCatalog = new Map<string, string>();

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
    } else {
      const { data: catalog, error: catalogError } = await service
        .from("catalog_items")
        .select("id, label, unit")
        .eq("organization_id", organizationId)
        .limit(10000);
      if (catalogError && catalogError.code !== "42P01") throw new Error("Impossible de contrôler les doublons du catalogue.");
      for (const item of catalog ?? []) {
        const key = catalogDuplicateKey({ label: item.label, unit: item.unit });
        if (key) duplicateCatalog.set(key, String(item.id));
      }
    }

    const seenSiret = new Map<string, number>();
    const seenEmail = new Map<string, number>();
    const seenCatalog = new Map<string, number>();
    const seenSource = new Map<string, number>();

    const staged = preview.rows.map((row) => {
      const normalized = row.normalizedData as Record<string, unknown>;
      const siret = String(normalized.siret ?? "").replace(/\D/g, "");
      const email = String(normalized.email ?? "").trim().toLowerCase();
      const catalogKey = preview.entityType === "catalog" ? catalogDuplicateKey(normalized) : "";
      const sourceId = row.sourceId?.trim() || "";
      let duplicateOf: string | null = null;
      let duplicateReason: string | null = null;

      if (sourceId && sourceLinks.has(sourceId)) {
        duplicateOf = sourceLinks.get(sourceId) || null;
        duplicateReason = "Identifiant déjà importé depuis cette source";
      } else if (sourceId && seenSource.has(sourceId)) {
        duplicateOf = `import-row:${seenSource.get(sourceId)}`;
        duplicateReason = "Identifiant dupliqué dans le fichier";
      } else if (preview.entityType === "customers") {
        if (siret && duplicateBySiret.has(siret)) {
          duplicateOf = duplicateBySiret.get(siret) || null;
          duplicateReason = "SIRET déjà présent";
        } else if (email && duplicateByEmail.has(email)) {
          duplicateOf = duplicateByEmail.get(email) || null;
          duplicateReason = "E-mail déjà présent";
        } else if (siret && seenSiret.has(siret)) {
          duplicateOf = `import-row:${seenSiret.get(siret)}`;
          duplicateReason = "SIRET dupliqué dans le fichier";
        } else if (email && seenEmail.has(email)) {
          duplicateOf = `import-row:${seenEmail.get(email)}`;
          duplicateReason = "E-mail dupliqué dans le fichier";
        }
      } else if (catalogKey) {
        if (duplicateCatalog.has(catalogKey)) {
          duplicateOf = duplicateCatalog.get(catalogKey) || null;
          duplicateReason = "Prestation déjà présente dans le catalogue";
        } else if (seenCatalog.has(catalogKey)) {
          duplicateOf = `import-row:${seenCatalog.get(catalogKey)}`;
          duplicateReason = "Prestation dupliquée dans le fichier";
        }
      }

      if (sourceId && !seenSource.has(sourceId)) seenSource.set(sourceId, row.rowIndex);
      if (siret && !seenSiret.has(siret)) seenSiret.set(siret, row.rowIndex);
      if (email && !seenEmail.has(email)) seenEmail.set(email, row.rowIndex);
      if (catalogKey && !seenCatalog.has(catalogKey)) seenCatalog.set(catalogKey, row.rowIndex);

      const status = row.validationErrors.length ? "invalid" : duplicateOf ? "duplicate" : "valid";
      return { ...row, duplicateOf, duplicateReason, status };
    });

    const counters = {
      total: staged.length,
      valid: staged.filter((row) => row.status === "valid").length,
      invalid: staged.filter((row) => row.status === "invalid").length,
      duplicates: staged.filter((row) => row.status === "duplicate").length,
    };

    let job;
    if (existingJobId) {
      const { data: existing, error } = await context.client
        .from("import_jobs")
        .select("id, organization_id, status")
        .eq("id", existingJobId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error || !existing || !["preview", "failed"].includes(String(existing.status))) {
        throw new ApiInputError("Cet import ne peut plus être remappé.", 409);
      }
      await service.from("import_staging_rows").delete().eq("job_id", existingJobId).eq("organization_id", organizationId);
      const { data: updated, error: updateError } = await service
        .from("import_jobs")
        .update({
          file_name: fileName,
          source_system: sourceSystem,
          entity_type: preview.entityType,
          status: "preview",
          mapping: preview.mapping,
          counters,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingJobId)
        .eq("organization_id", organizationId)
        .select("id, organization_id, file_name, source_system, entity_type, status, mapping, counters, created_at")
        .single();
      if (updateError || !updated) throw new Error("Le remapping n’a pas pu être enregistré.");
      job = updated;
    } else {
      const { data: created, error: jobError } = await context.client
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
      if (jobError || !created) throw new Error("La prévisualisation n’a pas pu être créée.");
      job = created;
    }

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
      const { error } = await service.from("import_staging_rows").insert(chunk);
      if (error) {
        await service.from("import_jobs").update({ status: "failed", error_message: "Échec de mise en staging." }).eq("id", job.id);
        throw new Error("La mise en staging de l’import a échoué.");
      }
    }

    return NextResponse.json({
      job,
      delimiter: preview.delimiter === "\t" ? "tab" : preview.delimiter,
      headers: preview.headers,
      fields: IMPORT_FIELDS[preview.entityType],
      mapping: preview.mapping,
      counters,
      sample: staged.slice(0, 30).map((row) => ({
        rowIndex: row.rowIndex,
        normalizedData: row.normalizedData,
        validationErrors: row.validationErrors,
        status: row.status,
        duplicateOf: row.duplicateOf,
        duplicateReason: row.duplicateReason,
      })),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Prévisualisation de l’import impossible.");
  }
}
