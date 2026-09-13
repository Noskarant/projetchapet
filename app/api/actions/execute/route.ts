import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { executeProposalBatch } from "@/lib/action-execution-server";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

export async function POST(request: Request) {
  const limited = rateLimit(request, "action-execute", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      organizationId?: unknown;
      proposalIds?: unknown;
      explicitConfirmation?: unknown;
    }>(request, 30_000);
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    if (!organizationId) throw new ApiInputError("Entreprise manquante.");
    const proposalIds = Array.isArray(body.proposalIds)
      ? [...new Set(body.proposalIds.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))].slice(0, 12)
      : [];
    if (!proposalIds.length) throw new ApiInputError("Aucune action à exécuter.");

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId);
    const result = await executeProposalBatch({
      context,
      organizationId,
      proposalIds,
      explicitConfirmation: body.explicitConfirmation === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Exécution des actions impossible.");
  }
}
