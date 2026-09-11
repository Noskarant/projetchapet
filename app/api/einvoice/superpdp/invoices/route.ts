import { NextResponse } from "next/server";
import {
  ApiInputError,
  base64ByteLength,
  errorResponse,
  rateLimit,
  readJsonBody,
  requireString,
} from "@/lib/api-guard";
import {
  getValidSuperPdpAccessToken,
  requireEInvoiceOrganizationAccess,
} from "@/lib/einvoice/server";
import {
  listSuperPdpInvoices,
  sendSuperPdpInvoice,
  superPdpConfiguration,
} from "@/lib/einvoice/superpdp";

export const runtime = "nodejs";

type SendInvoiceBody = {
  organizationId?: unknown;
  externalId?: unknown;
  contentType?: unknown;
  contentBase64?: unknown;
};

function providerConfig() {
  const { configured, config } = superPdpConfiguration();
  if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré sur le serveur.", 503);
  return config;
}

function cleanInvoiceContentType(value: unknown) {
  if (value === "application/pdf" || value === "application/xml" || value === "text/xml") return value;
  throw new ApiInputError("Format de facture non supporté. Utilisez Factur-X/PDF, UBL ou CII/XML.");
}

function invoiceBlob(contentBase64: string, contentType: "application/pdf" | "application/xml" | "text/xml") {
  if (base64ByteLength(contentBase64) > 9_000_000) {
    throw new ApiInputError("Facture trop volumineuse.", 413);
  }
  const clean = contentBase64.replace(/^data:[^,]+;base64,/i, "").replace(/\s/g, "");
  const bytes = Buffer.from(clean, "base64");
  if (!bytes.length) throw new ApiInputError("Fichier de facture vide.");
  if (contentType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiInputError("Le fichier Factur-X/PDF est invalide.");
  }
  if (contentType !== "application/pdf") {
    const prefix = bytes.subarray(0, Math.min(bytes.length, 300)).toString("utf8").trimStart();
    if (!prefix.startsWith("<")) throw new ApiInputError("Le fichier UBL/CII XML est invalide.");
  }
  return new Blob([Uint8Array.from(bytes)], { type: contentType });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "einvoice-superpdp-list", 30);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const access = await requireEInvoiceOrganizationAccess(request, organizationId);
    const direction = url.searchParams.get("direction") === "out" ? "out" : "in";
    const date = url.searchParams.get("date")?.trim() || undefined;
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 500)) : 100;
    const token = await getValidSuperPdpAccessToken(access.organizationId);
    const data = await listSuperPdpInvoices(providerConfig(), token, { direction, date, limit });
    return NextResponse.json({ provider: "superpdp", direction, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Lecture des factures électroniques impossible.");
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "einvoice-superpdp-send", 10);
  if (limited) return limited;

  try {
    const body = await readJsonBody<SendInvoiceBody>(request, 12_500_000);
    const organizationId = typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : undefined;
    const access = await requireEInvoiceOrganizationAccess(
      request,
      organizationId,
      ["owner", "admin", "office", "manager", "accountant"],
    );
    const externalId = requireString(body.externalId, "Identifiant externe", 120);
    const contentType = cleanInvoiceContentType(body.contentType);
    const contentBase64 = requireString(body.contentBase64, "Fichier de facture", 12_000_000);
    const content = invoiceBlob(contentBase64, contentType);
    const token = await getValidSuperPdpAccessToken(access.organizationId);
    const data = await sendSuperPdpInvoice(providerConfig(), token, {
      externalId,
      content,
      contentType,
    });
    return NextResponse.json({ provider: "superpdp", transmitted: true, data });
  } catch (error) {
    return errorResponse(error, "Transmission de la facture électronique impossible.");
  }
}
