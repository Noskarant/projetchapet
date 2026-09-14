import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, isEmail } from "@/lib/api-guard";
import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  isInvitableRole,
  isOrganizationRole,
  type OrganizationRole,
} from "@/lib/pilot-operations";
import {
  authenticateRequest,
  requireOrganization as requireOrganizationMembership,
  type AuthenticatedRequestContext,
} from "@/lib/server-auth";
import { publicSiteUrl } from "@/lib/server-organization";
import { supabasePublicConfig } from "@/lib/supabase-config";

export const runtime = "nodejs";

type TeamContext = {
  context: AuthenticatedRequestContext;
  organizationId: string;
  role: OrganizationRole;
};

type InvitationRow = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "cancelled";
  created_at: string;
  accepted_by: string | null;
};

function requestedOrganizationId(request: Request, body?: { organizationId?: unknown }) {
  if (body && typeof body.organizationId === "string" && body.organizationId.trim()) {
    return body.organizationId.trim();
  }
  try {
    return new URL(request.url).searchParams.get("organizationId")?.trim() ?? "";
  } catch {
    return "";
  }
}

function resolveTeamContext(
  context: AuthenticatedRequestContext,
  requestedId = "",
  allowedRoles?: readonly OrganizationRole[],
): TeamContext {
  const organizationId = requestedId || context.memberships[0]?.organizationId || "";
  if (!organizationId) throw new ApiInputError("Aucune entreprise MANUFEO accessible.", 403);
  const membership = requireOrganizationMembership(context, organizationId, allowedRoles);
  if (!isOrganizationRole(membership.role)) throw new ApiInputError("Rôle d’entreprise invalide.", 403);
  return { context, organizationId, role: membership.role };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendViaResend(request: Request, email: string, organizationName: string, role: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM_EMAIL?.trim() || "MANUFEO <no-reply@manufeo.fr>";
  const appUrl = publicSiteUrl(request);
  const safeOrganization = escapeHtml(organizationName);
  const safeRole = escapeHtml(role);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${organizationName} vous invite sur MANUFEO`,
      html: `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F9FC;font-family:Arial,sans-serif;color:#102B50"><table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:white;border:1px solid #E4EAF1;border-radius:18px;overflow:hidden"><tr><td style="background:#102B50;padding:26px 30px;color:white"><strong style="font-size:14px;letter-spacing:1px">MANUFEO</strong><h1 style="margin:8px 0 0;font-size:25px">Invitation à rejoindre ${safeOrganization}</h1></td></tr><tr><td style="padding:30px"><p style="line-height:1.6">Vous avez été invité à rejoindre l’entreprise <strong>${safeOrganization}</strong> avec le rôle <strong>${safeRole}</strong>.</p><p style="line-height:1.6">Connectez-vous ou créez votre compte avec cette adresse e-mail. MANUFEO vous rattachera automatiquement à l’entreprise.</p><p style="margin:28px 0"><a href="${appUrl}" style="background:#0875F5;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Ouvrir MANUFEO</a></p><p style="color:#6B7C8F;font-size:13px">Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message.</p></td></tr></table></td></tr></table></body></html>`,
    }),
  });
  return response.ok;
}

async function sendViaSupabaseMagicLink(request: Request, email: string) {
  const client = createClient(
    supabasePublicConfig.url,
    supabasePublicConfig.publishableKey,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    },
  );
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: publicSiteUrl(request),
    },
  });
  if (error) throw new Error("L’e-mail d’invitation n’a pas pu être envoyé.");
}

async function sendInvitationEmail(request: Request, email: string, organizationName: string, role: string) {
  try {
    if (await sendViaResend(request, email, organizationName, role)) return "resend" as const;
  } catch {
    // Le SMTP Supabase ci-dessous reste le filet de sécurité si Resend API est absent ou temporairement indisponible.
  }
  await sendViaSupabaseMagicLink(request, email);
  return "supabase" as const;
}

function currentUserName(context: AuthenticatedRequestContext) {
  const metadata = context.user.user_metadata ?? {};
  return String(metadata.full_name ?? metadata.name ?? context.user.email?.split("@")[0] ?? "Utilisateur");
}

export async function GET(request: Request) {
  try {
    const context = await authenticateRequest(request);
    const team = resolveTeamContext(context, requestedOrganizationId(request));
    const [{ data: organization }, { data: memberships, error: memberError }, { data: invitations, error: inviteError }] = await Promise.all([
      context.client.from("organizations").select("name").eq("id", team.organizationId).single(),
      context.client.from("organization_members").select("user_id,role,created_at").eq("organization_id", team.organizationId).order("created_at"),
      context.client.from("organization_invitations").select("id,email,role,status,created_at,accepted_by").eq("organization_id", team.organizationId).order("created_at", { ascending: false }),
    ]);
    if (memberError || inviteError) throw new Error("Impossible de charger l’équipe.");

    const invitationRows = (invitations ?? []) as InvitationRow[];
    const acceptedByUser = new Map(
      invitationRows
        .filter((invitation) => invitation.status === "accepted" && invitation.accepted_by)
        .map((invitation) => [String(invitation.accepted_by), invitation]),
    );
    const members = (memberships ?? []).map((membership) => {
      const userId = String(membership.user_id);
      const current = userId === context.user.id;
      const acceptedInvite = acceptedByUser.get(userId);
      const email = current ? (context.user.email ?? "") : (acceptedInvite?.email ?? "");
      return {
        userId,
        email,
        name: current
          ? currentUserName(context)
          : email
            ? email.split("@")[0]
            : `Membre ${userId.slice(0, 8)}`,
        role: String(membership.role),
        joinedAt: String(membership.created_at ?? ""),
        current,
      };
    });

    return NextResponse.json({
      organizationId: team.organizationId,
      organizationName: organization?.name ?? "Mon entreprise",
      currentRole: team.role,
      canManage: team.role === "owner" || team.role === "admin",
      members,
      invitations: invitationRows.filter((invitation) => invitation.status === "pending"),
      invitableRoles: INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Chargement de l’équipe impossible.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await authenticateRequest(request);
    const body = await request.json() as { email?: unknown; role?: unknown; organizationId?: unknown };
    const team = resolveTeamContext(context, requestedOrganizationId(request, body), ["owner", "admin"]);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    if (!isInvitableRole(body.role)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

    const { data: organization } = await context.client.from("organizations").select("name").eq("id", team.organizationId).single();
    const { data: existing, error: existingError } = await context.client
      .from("organization_invitations")
      .select("id")
      .eq("organization_id", team.organizationId)
      .ilike("email", email)
      .maybeSingle();
    if (existingError) throw new Error("Impossible de vérifier les invitations existantes.");

    let invitationId = existing?.id as string | undefined;
    if (invitationId) {
      const { error } = await context.client.from("organization_invitations").update({
        email,
        role: body.role,
        status: "pending",
        invited_by: context.user.id,
        accepted_by: null,
        accepted_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", invitationId).eq("organization_id", team.organizationId);
      if (error) throw new Error("Impossible de renouveler l’invitation.");
    } else {
      const { data, error } = await context.client.from("organization_invitations").insert({
        organization_id: team.organizationId,
        email,
        role: body.role,
        invited_by: context.user.id,
      }).select("id").single();
      if (error) throw new Error("Impossible de créer l’invitation.");
      invitationId = String(data.id);
    }

    const delivery = await sendInvitationEmail(
      request,
      email,
      String(organization?.name ?? "Votre entreprise"),
      ROLE_LABELS[body.role],
    );
    return NextResponse.json({ ok: true, invitationId, delivery });
  } catch (error) {
    return errorResponse(error, "Invitation impossible.");
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await authenticateRequest(request);
    const body = await request.json() as { userId?: unknown; role?: unknown; organizationId?: unknown };
    const team = resolveTeamContext(context, requestedOrganizationId(request, body), ["owner", "admin"]);
    const userId = String(body.userId ?? "");
    if (!userId || userId === context.user.id) return NextResponse.json({ error: "Modification de votre propre rôle interdite ici." }, { status: 400 });
    if (!isInvitableRole(body.role)) return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });

    const { data: target } = await context.client.from("organization_members").select("role").eq("organization_id", team.organizationId).eq("user_id", userId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    if (target.role === "owner") return NextResponse.json({ error: "Le rôle propriétaire ne peut pas être modifié." }, { status: 403 });
    if (target.role === "admin" && team.role !== "owner") return NextResponse.json({ error: "Seul le propriétaire peut modifier un administrateur." }, { status: 403 });

    const { error } = await context.client.from("organization_members").update({ role: body.role }).eq("organization_id", team.organizationId).eq("user_id", userId);
    if (error) throw new Error("Impossible de modifier le rôle.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Modification du rôle impossible.");
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await authenticateRequest(request);
    const body = await request.json() as { userId?: unknown; invitationId?: unknown; organizationId?: unknown };
    const team = resolveTeamContext(context, requestedOrganizationId(request, body), ["owner", "admin"]);
    const invitationId = String(body.invitationId ?? "");
    if (invitationId) {
      const { error } = await context.client.from("organization_invitations").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", invitationId).eq("organization_id", team.organizationId);
      if (error) throw new Error("Impossible d’annuler l’invitation.");
      return NextResponse.json({ ok: true });
    }

    const userId = String(body.userId ?? "");
    if (!userId || userId === context.user.id) return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre accès ici." }, { status: 400 });
    const { data: target } = await context.client.from("organization_members").select("role").eq("organization_id", team.organizationId).eq("user_id", userId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
    if (target.role === "owner") return NextResponse.json({ error: "Le propriétaire ne peut pas être supprimé." }, { status: 403 });
    if (target.role === "admin" && team.role !== "owner") return NextResponse.json({ error: "Seul le propriétaire peut supprimer un administrateur." }, { status: 403 });

    const { error } = await context.client.from("organization_members").delete().eq("organization_id", team.organizationId).eq("user_id", userId);
    if (error) throw new Error("Impossible de supprimer ce membre.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Suppression impossible.");
  }
}
