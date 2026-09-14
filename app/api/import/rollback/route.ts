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
  const limited = rateLimit(request, "import-rollback", 3);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      organizationId?: unknown;
      jobId?: unknown;
      confirmed?: unknown;
    }>(request, 12_000);

    const organizationId = cleanId(body.organizationId, "Entreprise");
    const jobId = cleanId(body.jobId, "Import");
    if (body.confirmed !== true) throw new ApiInputError("Confirmez l’annulation de l’import.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin"]);

    const { data: job, error: jobError } = await context.client
      .from("import_jobs")
      .select("id, organization_id, status")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (jobError || !job) throw new ApiInputError("Import introuvable.", 404);
    if (!["completed", "rollback_partial"].includes(String(job.status))) {
      throw new ApiInputError("Cet import ne peut pas être annulé.", 409);
    }

    const service = importServiceClient();
    const { data, error } = await service.rpc("rollback_import_job", {
      p_job_id: jobId,
      p_actor: context.user.id,
    });
    if (error) throw new Error(error.message || "Le rollback de l’import a échoué.");

    return NextResponse.json({ result: data });
  } catch (error) {
    return errorResponse(error, "Annulation de l’import impossible.");
  }
}
