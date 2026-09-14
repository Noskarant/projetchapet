import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { importServiceClient } from "@/lib/import-server";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

export const runtime = "nodejs";

function cleanId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new ApiInputError(`${label} invalide.`);
  return value;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "import-commit", 4);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      organizationId?: unknown;
      jobId?: unknown;
      duplicateStrategy?: unknown;
      confirmed?: unknown;
    }>(request, 20_000);

    const organizationId = cleanId(body.organizationId, "Entreprise");
    const jobId = cleanId(body.jobId, "Import");
    const duplicateStrategy = body.duplicateStrategy === "create" ? "create" : "skip";
    if (body.confirmed !== true) throw new ApiInputError("Confirmez l’import avant de continuer.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin"]);

    const { data: job, error: jobError } = await context.client
      .from("import_jobs")
      .select("id, organization_id, status, counters")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (jobError || !job) throw new ApiInputError("Import introuvable.", 404);
    if (!["preview", "failed"].includes(String(job.status))) throw new ApiInputError("Cet import a déjà été traité.", 409);

    const counters = (job.counters ?? {}) as Record<string, unknown>;
    if (Number(counters.valid ?? 0) + Number(counters.duplicates ?? 0) <= 0) {
      throw new ApiInputError("Aucune ligne importable dans ce fichier.", 409);
    }

    const service = importServiceClient();
    const { data, error } = await service.rpc("commit_import_job", {
      p_job_id: jobId,
      p_actor: context.user.id,
      p_duplicate_strategy: duplicateStrategy,
    });
    if (error) throw new Error(error.message || "La transaction d’import a échoué.");

    return NextResponse.json({ result: data });
  } catch (error) {
    return errorResponse(error, "Import impossible.");
  }
}
