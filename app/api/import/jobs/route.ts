import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit } from "@/lib/api-guard";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "import-jobs", 20);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new ApiInputError("Entreprise invalide.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin"]);

    const { data, error } = await context.client
      .from("import_jobs")
      .select("id, file_name, source_system, entity_type, status, counters, created_at, committed_at, updated_at, error_message")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Historique des imports indisponible.");

    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    return errorResponse(error, "Historique des imports indisponible.");
  }
}
