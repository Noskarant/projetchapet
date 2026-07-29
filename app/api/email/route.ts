import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Attachment = { filename: string; content: string };

function cleanEmails(value: unknown) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
  return list.map((item) => String(item).trim()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      to?: string;
      cc?: string[] | string;
      bcc?: string[] | string;
      subject?: string;
      html?: string;
      attachments?: Attachment[];
    };
    const to = String(body.to ?? "").trim();
    if (!to) return NextResponse.json({ error: "Destinataire manquant." }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      return NextResponse.json({ configured: false, error: "RESEND_API_KEY ou RESEND_FROM_EMAIL non configurée." }, { status: 503 });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        cc: cleanEmails(body.cc),
        bcc: cleanEmails(body.bcc),
        subject: body.subject || "Votre document",
        html: body.html || "<p>Veuillez trouver votre document en pièce jointe.</p>",
        attachments: (body.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
        })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message ?? `Resend API : ${response.status}`);
    return NextResponse.json({ configured: true, id: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi impossible." }, { status: 500 });
  }
}
