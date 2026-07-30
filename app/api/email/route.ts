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

export const runtime = "nodejs";

type Attachment = { filename?: unknown; content?: unknown };
type EmailBody = {
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
  return [...new Set(emails)];
}

function cleanAttachments(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 2) {
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
    return { filename, content };
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "email", 5);
  if (limited) return limited;

  try {
    const body = await readJsonBody<EmailBody>(request, 11_500_000);
    const to = requireString(body.to, "Destinataire", 254);
    if (!isEmail(to)) throw new ApiInputError("Adresse du destinataire invalide.");

    const subject = optionalString(body.subject, 180) || "Votre document";
    const html = optionalString(body.html, 30_000) || "<p>Veuillez trouver votre document en pièce jointe.</p>";
    const attachments = cleanAttachments(body.attachments);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json(
        { configured: false, error: "RESEND_API_KEY ou RESEND_FROM_EMAIL non configurée." },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        cc: cleanEmails(body.cc),
        bcc: cleanEmails(body.bcc),
        subject,
        html,
        attachments,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Resend API : ${response.status}`);
    return NextResponse.json({ configured: true, id: data.id });
  } catch (error) {
    return errorResponse(error, "Envoi impossible.");
  }
}
