import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isEmail } from "@/lib/api-guard";
import { organizationErrorResponse, requireOrganization, requireRole } from "@/lib/server-organization";

export const runtime = "nodejs";

type DocumentKind = "quote" | "invoice";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

async function documentSnapshot(admin: SupabaseClient, organizationId: string, kind: DocumentKind, number: string) {
  const { data: snapshot, error } = await admin
    .from("pilot_workspace_snapshots")
    .select("workspace,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Impossible de charger le document à signer.");
  const workspace = snapshot?.workspace as { quotes?: Array<Record<string, unknown>>; invoices?: Array<Record<string, unknown>> } | null;
  const collection = kind === "quote" ? workspace?.quotes : workspace?.invoices;
  const found = collection?.find((item) => String(item.number ?? "") === number);
  if (found) return { source: "pilot_workspace", updatedAt: snapshot?.updated_at ?? null, document: found };

  const table = kind === "quote" ? "quotes" : "invoices";
  const { data: coreDocument, error: coreError } = await admin
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("number", number)
    .maybeSingle();
  if (coreError) throw new Error("Impossible de charger le document à signer.");
  if (!coreDocument) return null;
  return { source: "core_document", updatedAt: coreDocument.updated_at ?? null, document: coreDocument };
}

export async function GET(request: Request) {
  try {
    const { admin, organizationId } = await requireOrganization(request);
    const { data, error } = await admin
      .from("document_signatures")
      .select("id,document_kind,document_number,signer_name,signer_email,consent_text,document_hash,signed_at,signed_by_user")
      .eq("organization_id", organizationId)
      .order("signed_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Impossible de charger les signatures.");
    return NextResponse.json({ signatures: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization(request);
    requireRole(context.role, ["owner", "admin", "office", "manager"]);
    const body = await request.json() as {
      documentKind?: unknown;
      documentNumber?: unknown;
      signerName?: unknown;
      signerEmail?: unknown;
      consent?: unknown;
    };
    const kind = body.documentKind === "quote" || body.documentKind === "invoice" ? body.documentKind : null;
    const number = String(body.documentNumber ?? "").trim();
    const signerName = String(body.signerName ?? "").trim();
    const signerEmail = String(body.signerEmail ?? "").trim().toLowerCase();
    if (!kind || !number || signerName.length < 2 || !isEmail(signerEmail) || body.consent !== true) {
      return NextResponse.json({ error: "Document, signataire et consentement sont obligatoires." }, { status: 400 });
    }

    const snapshot = await documentSnapshot(context.admin, context.organizationId, kind, number);
    if (!snapshot) return NextResponse.json({ error: "Document introuvable. Enregistrez-le avant la signature." }, { status: 404 });

    const consentText = `Je confirme avoir lu le ${kind === "quote" ? "devis" : "document"} ${number}, en accepter le contenu et signer électroniquement ce document.`;
    const documentHash = hash(canonical(snapshot));
    const auditSecret = process.env.EINVOICE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "manufeo-audit";
    const ipHash = hash(`${auditSecret}|${clientIp(request)}`);
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 500);

    const { data, error } = await context.admin.from("document_signatures").insert({
      organization_id: context.organizationId,
      document_kind: kind,
      document_number: number,
      signer_name: signerName,
      signer_email: signerEmail,
      consent_text: consentText,
      document_hash: documentHash,
      ip_hash: ipHash,
      user_agent: userAgent,
      signed_by_user: context.user.id,
    }).select("id,document_kind,document_number,signer_name,signer_email,document_hash,signed_at").single();
    if (error) throw new Error("Impossible d’enregistrer la signature.");
    return NextResponse.json({ signature: data });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
