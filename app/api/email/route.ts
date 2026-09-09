import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ApiInputError,
  base64ByteLength,
  errorResponse,
  isEmail,
  optionalString,
  rateLimit,
  readJsonBody,
  requireString,
} from "@/lib/api-guard";
import {
  recipientsAreAuthorized,
  snapshotRecipientsForDocument,
  uniqueValidEmails,
  type EmailDocumentKind,
} from "@/lib/email-authorization";

export const runtime = "nodejs";

type Attachment = { filename?: unknown; content?: unknown };
type EmailBody = {
  documentNumber?: unknown;
  documentKind?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  html?: unknown;
  attachments?: unknown;
};

function cleanEmails(value: unknown) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
  const emails = list.map((item) => String(item).trim()).filter(Boolean);
  if (emails.length > 5 || emails.some((item) => !isEmail(item))) {
    throw new ApiInputError("Adresse e-mail en copie invalide.");
  }
  return [...new Set(emails.map((email) => email.toLowerCase()))];
}

function cleanDocumentKind(value: unknown): EmailDocumentKind {
  if (value === "quote" || value === "invoice") return value;
  throw new ApiInputError("Type de document invalide.");
}

function normalizePdfBase64(value: string) {
  return value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
}

function hasPdfMagic(value: string) {
  const clean = normalizePdfBase64(value);
  if (clean.length < 8) return false;
  try {
    return Buffer.from(clean.slice(0, 16), "base64").subarray(0, 5).toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

function cleanAttachments(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiInputError("Un document PDF est requis pour l’envoi.");
  }
  if (value.length > 2) {
    throw new ApiInputError("Deux pièces jointes maximum sont autorisées.");
  }

  let totalBytes = 0;
  return value.map((raw) => {
    const attachment = raw as Attachment;
    const filename = requireString(attachment.filename, "Nom de fichier", 120)
      .replace(/[\\/:*?"<>|]/g, "-");
    const content = requireString(attachment.content, "Contenu de la pièce jointe", 11_000_000);
    totalBytes += base64ByteLength(content);
    if (totalBytes > 7_500_000) throw new ApiInputError("Pièces jointes trop volumineuses.", 413);
    if (!filename.toLowerCase().endsWith(".pdf") || !hasPdfMagic(content)) {
      throw new ApiInputError("Seuls les documents PDF valides peuvent être envoyés.");
    }
    return { filename, content: normalizePdfBase64(content) };
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8_000) throw new ApiInputError("Authentification requise.", 401);
  return match[1];
}

function authenticatedSupabase(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiInputError("Service d’authentification indisponible.", 503);

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authorizeRecipients(
  request: Request,
  documentNumber: string,
  documentKind: EmailDocumentKind,
  requestedRecipients: string[],
) {
  const token = bearerToken(request);
  const client = authenticatedSupabase(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new ApiInputError("Votre session a expiré. Reconnectez-vous.", 401);

  const { data: memberships, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userData.user.id);
  if (membershipError) throw new Error("Organisation inaccessible");

  const organizationIds = [...new Set((memberships ?? []).map((row) => String(row.organization_id)).filter(Boolean))];
  if (!organizationIds.length) throw new ApiInputError("Aucune entreprise autorisée pour cet envoi.", 403);

  const allowed = new Set<string>();
  let documentFound = false;

  const { data: snapshots, error: snapshotError } = await client
    .from("pilot_workspace_snapshots")
    .select("organization_id, workspace, company_profile")
    .in("organization_id", organizationIds);
  if (snapshotError) throw new Error("Espace de travail inaccessible");

  for (const snapshot of snapshots ?? []) {
    const authorization = snapshotRecipientsForDocument(snapshot, documentNumber, documentKind);
    if (!authorization.found) continue;
    documentFound = true;
    authorization.emails.forEach((email) => allowed.add(email));
  }

  const documentTable = documentKind === "quote" ? "quotes" : "invoices";
  const { data: documents, error: documentError } = await client
    .from(documentTable)
    .select("organization_id, customer_id, number")
    .eq("number", documentNumber)
    .in("organization_id", organizationIds);
  if (documentError) throw new Error("Document inaccessible");

  if (documents?.length) {
    documentFound = true;
    const customerIds = [...new Set(documents.map((row) => String(row.customer_id)).filter(Boolean))];
    if (customerIds.length) {
      const { data: customers, error: customerError } = await client
        .from("customers")
        .select("id, emails")
        .in("id", customerIds);
      if (customerError) throw new Error("Client inaccessible");
      uniqueValidEmails((customers ?? []).flatMap((row) => Array.isArray(row.emails) ? row.emails : []))
        .forEach((email) => allowed.add(email));
    }

    const matchingOrganizationIds = [...new Set(documents.map((row) => String(row.organization_id)).filter(Boolean))];
    const { data: organizations, error: organizationError } = await client
      .from("organizations")
      .select("id, accountant_email")
      .in("id", matchingOrganizationIds);
    if (organizationError) throw new Error("Entreprise inaccessible");
    uniqueValidEmails((organizations ?? []).map((row) => row.accountant_email))
      .forEach((email) => allowed.add(email));
  }

  if (!documentFound) throw new ApiInputError("Document introuvable dans votre entreprise.", 404);
  if (!recipientsAreAuthorized(requestedRecipients, [...allowed])) {
    throw new ApiInputError("Ce destinataire n’est pas rattaché à ce document ou à votre comptabilité.", 403);
  }
}

export async function GET() {
  const from = process.env.RESEND_FROM_EMAIL ?? "";
  return NextResponse.json(
    { configured: Boolean(process.env.RESEND_API_KEY && from) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "email", 5);
  if (limited) return limited;

  try {
    const body = await readJsonBody<EmailBody>(request, 11_500_000);
    const documentNumber = requireString(body.documentNumber, "Numéro du document", 80);
    const documentKind = cleanDocumentKind(body.documentKind);
    const to = requireString(body.to, "Destinataire", 254).toLowerCase();
    if (!isEmail(to)) throw new ApiInputError("Adresse du destinataire invalide.");
    const cc = cleanEmails(body.cc);
    const bcc = cleanEmails(body.bcc);

    await authorizeRecipients(request, documentNumber, documentKind, [to, ...cc, ...bcc]);

    const subject = optionalString(body.subject, 180) || "Votre document";
    const html = optionalString(body.html, 30_000) || "<p>Veuillez trouver votre document en pièce jointe.</p>";
    const attachments = cleanAttachments(body.attachments);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json(
        { configured: false, error: "Le service d’envoi n’est pas configuré." },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from,
        to: [to],
        cc,
        bcc,
        subject,
        html,
        attachments,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Resend API : ${response.status}`);
    return NextResponse.json({ configured: true, id: data.id });
  } catch (error) {
    return errorResponse(error, "Envoi impossible.");
  }
}
