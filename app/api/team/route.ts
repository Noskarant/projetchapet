import { NextResponse } from "next/server";
import { isEmail } from "@/lib/api-guard";
import { INVITABLE_ROLES, ROLE_LABELS, isInvitableRole } from "@/lib/pilot-operations";
import {
  organizationErrorResponse,
  publicSiteUrl,
  requireOrganization,
  requireRole,
} from "@/lib/server-organization";

export const runtime = "nodejs";

async function sendInvitationEmail(request: Request, email: string, organizationName: string, role: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Le service e-mail MANUFEO n’est pas configuré.");
  const appUrl = publicSiteUrl(request);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${organizationName} vous invite sur MANUFEO`,
      html: `<!doctype html><html><body style="margin:0;background:#F7F9FC;font-family:Arial,sans-serif;color:#102B50"><table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:600px;background:white;border:1px solid #E4EAF1;border-radius:18px;overflow:hidden"><tr><td style="background:#102B50;padding:26px 30px;color:white"><strong style="font-size:14px;letter-spacing:1px">MANUFEO</strong><h1 style="margin:8px 0 0;font-size:25px">Invitation à rejoindre ${organizationName}</h1></td></tr><tr><td style="padding:30px"><p style="line-height:1.6">Vous avez été invité à rejoindre l’entreprise <strong>${organizationName}</strong> avec le rôle <strong>${role}</strong>.</p><p style="line-height:1.6">Connectez-vous ou créez votre compte avec cette adresse e-mail. MANUFEO vous rattachera automatiquement à l’entreprise.</p><p style="margin:28px 0"><a href="${appUrl}" style="background:#0875F5;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Ouvrir MANUFEO</a></p><p style="color:#6B7C8F;font-size:13px">Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message.</p></td></tr></table></td></tr></table></body></html>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend API : ${response.status}`);
}

export async function GET(request: Request) {
  try {
    const { admin, user, organizationId, role } = await requireOrganization(request);
    const [{ data: organization }, { data: memberships, error: memberError }, { data: invitations, error: inviteError }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", organizationId).single(),
      admin.from("organization_members").select("user_id,role,created_at").eq("organization_id", organizationId).order("created_at"),
      admin.from("organization_invitations").select("id,email,role,status,created_at").eq("organization_id", organizationId).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    if (memberError || inviteError) throw new Error("Impossible de charger l’équipe.");

    const members = await Promise.all((memberships ?? []).map(async (membership) => {
      const { data } = await admin.auth.admin.getUserById(String(membership.user_id));
      const member = data.user;
      return {
        userId: String(membership.user_id),
        email: member?.email ?? "",
        name: String(member?.user_metadata?.full_name ?? member?.user_metadata?.name ?? member?.email?.split("@")[0] ?? "Utilisateur"),
        role: String(membership.role),
        joinedAt: String(membership.created_at ?? ""),
        current: membership.user_id === user.id,
      };
    }));

    return NextResponse.json({
      organizationId,
      organizationName: organization?.name ?? "Mon entreprise",
      currentRole: role,
      canManage: role === "owner" || role === "admin",
      members,
      invitations: invitations ?? [],
      invitableRoles: INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization(request);
    requireRole(context.role, ["owner", "admin"]);
    const body = await request.json() as { email?: unknown; role?: unknown };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    if (!isInvitableRole(body.role)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

    const { data: organization } = await context.admin.from("organizations").select("name").eq("id", context.organizationId).single();
    const { data: existing } = await context.admin
      .from("organization_invitations")
      .select("id")
      .eq("organization_id", context.organizationId)
      .ilike("email", email)
      .maybeSingle();

    let invitationId = existing?.id as string | undefined;
    if (invitationId) {
      const { error } = await context.admin.from("organization_invitations").update({
        email,
        role: body.role,
        status: "pending",
        invited_by: context.user.id,
        accepted_by: null,
        accepted_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", invitationId);
      if (error) throw new Error("Impossible de renouveler l’invitation.");
    } else {
      const { data, error } = await context.admin.from("organization_invitations").insert({
        organization_id: context.organizationId,
        email,
        role: body.role,
        invited_by: context.user.id,
      }).select("id").single();
      if (error) throw new Error("Impossible de créer l’invitation.");
      invitationId = String(data.id);
    }

    await sendInvitationEmail(request, email, String(organization?.name ?? "Votre entreprise"), ROLE_LABELS[body.role]);
    return NextResponse.json({ ok: true, invitationId });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireOrganization(request);
    requireRole(context.role, ["owner", "admin"]);
    const body = await request.json() as { userId?: unknown; role?: unknown };
    const userId = String(body.userId ?? "");
    if (!userId || userId === context.user.id) return NextResponse.json({ error: "Modification de votre propre rôle interdite ici." }, { status: 400 });
    if (!isInvitableRole(body.role)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

    const { data: target } = await context.admin.from("organization_members").select("role").eq("organization_id", context.organizationId).eq("user_id", userId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    if (target.role === "owner") return NextResponse.json({ error: "Le rôle propriétaire ne peut pas être modifié." }, { status: 403 });
    if (target.role === "admin" && context.role !== "owner") return NextResponse.json({ error: "Seul le propriétaire peut modifier un administrateur." }, { status: 403 });

    const { error } = await context.admin.from("organization_members").update({ role: body.role }).eq("organization_id", context.organizationId).eq("user_id", userId);
    if (error) throw new Error("Impossible de modifier le rôle.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireOrganization(request);
    requireRole(context.role, ["owner", "admin"]);
    const body = await request.json() as { userId?: unknown; invitationId?: unknown };
    const invitationId = String(body.invitationId ?? "");
    if (invitationId) {
      const { error } = await context.admin.from("organization_invitations").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", invitationId).eq("organization_id", context.organizationId);
      if (error) throw new Error("Impossible d’annuler l’invitation.");
      return NextResponse.json({ ok: true });
    }

    const userId = String(body.userId ?? "");
    if (!userId || userId === context.user.id) return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre accès ici." }, { status: 400 });
    const { data: target } = await context.admin.from("organization_members").select("role").eq("organization_id", context.organizationId).eq("user_id", userId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    if (target.role === "owner") return NextResponse.json({ error: "Le propriétaire ne peut pas être supprimé." }, { status: 403 });
    if (target.role === "admin" && context.role !== "owner") return NextResponse.json({ error: "Seul le propriétaire peut supprimer un administrateur." }, { status: 403 });

    const { error } = await context.admin.from("organization_members").delete().eq("organization_id", context.organizationId).eq("user_id", userId);
    if (error) throw new Error("Impossible de supprimer ce membre.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
