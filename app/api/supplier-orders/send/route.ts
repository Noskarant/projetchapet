import { NextResponse } from "next/server";
import { organizationErrorResponse, requireOrganization, requireRole } from "@/lib/server-organization";
import { supplierOrderTotal } from "@/lib/pilot-operations";

export const runtime = "nodejs";

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization(request);
    requireRole(context.role, ["owner", "admin", "office", "manager"]);
    const body = await request.json() as { orderId?: unknown; confirmed?: unknown };
    const orderId = String(body.orderId ?? "");
    if (!orderId || body.confirmed !== true) {
      return NextResponse.json({ error: "Confirmation humaine obligatoire avant l’envoi." }, { status: 400 });
    }

    const { data: order, error: orderError } = await context.admin
      .from("supplier_orders")
      .select("id,supplier_name,supplier_email,label,quantity,unit_price,notes,status,project_id")
      .eq("id", orderId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();
    if (orderError) throw new Error("Impossible de charger la commande fournisseur.");
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    if (order.status !== "approved") {
      return NextResponse.json({ error: order.status === "sent" ? "Cette commande a déjà été envoyée." : "La commande doit être validée avant l’envoi." }, { status: 409 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return NextResponse.json({ error: "Le service e-mail MANUFEO n’est pas configuré." }, { status: 503 });

    const { data: organization } = await context.admin.from("organizations").select("name").eq("id", context.organizationId).single();
    const total = supplierOrderTotal(Number(order.quantity), Number(order.unit_price));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from,
        to: [order.supplier_email],
        subject: `Bon de commande – ${order.label}`,
        html: `<!doctype html><html><body style="margin:0;background:#F7F9FC;font-family:Arial,sans-serif;color:#102B50"><table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:620px;background:white;border:1px solid #E4EAF1;border-radius:18px;overflow:hidden"><tr><td style="background:#102B50;color:white;padding:26px 30px"><strong style="font-size:14px;letter-spacing:1px">MANUFEO</strong><h1 style="margin:8px 0 0;font-size:24px">Bon de commande fournisseur</h1></td></tr><tr><td style="padding:30px"><p>Bonjour ${order.supplier_name},</p><p>Merci de prendre en compte la commande suivante pour <strong>${organization?.name ?? "notre entreprise"}</strong>.</p><table width="100%" style="border-collapse:collapse;margin:22px 0"><tr><td style="padding:10px;border-bottom:1px solid #E7ECF2">Désignation</td><td style="padding:10px;border-bottom:1px solid #E7ECF2;text-align:right"><strong>${order.label}</strong></td></tr><tr><td style="padding:10px;border-bottom:1px solid #E7ECF2">Quantité</td><td style="padding:10px;border-bottom:1px solid #E7ECF2;text-align:right">${order.quantity}</td></tr><tr><td style="padding:10px;border-bottom:1px solid #E7ECF2">Prix unitaire</td><td style="padding:10px;border-bottom:1px solid #E7ECF2;text-align:right">${euro(Number(order.unit_price))}</td></tr><tr><td style="padding:10px">Total estimé</td><td style="padding:10px;text-align:right;font-size:18px;color:#0875F5"><strong>${euro(total)}</strong></td></tr></table>${order.notes ? `<p style="background:#F7F9FC;padding:14px;border-radius:10px"><strong>Notes :</strong><br>${String(order.notes).replace(/[<>&]/g, "")}</p>` : ""}<p style="font-size:13px;color:#6B7C8F">Cette commande a été explicitement validée par un utilisateur autorisé dans MANUFEO avant son envoi.</p></td></tr></table></td></tr></table></body></html>`,
      }),
    });
    const responseData = await response.json().catch(() => ({})) as { id?: string };
    if (!response.ok) throw new Error(`Resend API : ${response.status}`);

    const { error: updateError } = await context.admin.from("supplier_orders").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: responseData.id ?? null,
    }).eq("id", orderId).eq("organization_id", context.organizationId).eq("status", "approved");
    if (updateError) throw new Error("Le mail est parti mais le statut de commande n’a pas pu être enregistré.");

    return NextResponse.json({ ok: true, id: responseData.id ?? null });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
