import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/team/route.ts", "utf8");

test("l’invitation équipe ne dépend plus de la service-role Vercel", () => {
  assert.match(route, /authenticateRequest\(request\)/);
  assert.match(route, /context\.client\.from\("organization_invitations"\)/);
  assert.doesNotMatch(route, /createServiceSupabase/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("l’envoi d’invitation possède un fallback SMTP Supabase", () => {
  assert.match(route, /sendViaResend/);
  assert.match(route, /MANUFEO <no-reply@manufeo\.fr>/);
  assert.match(route, /signInWithOtp/);
  assert.match(route, /shouldCreateUser:\s*true/);
  assert.match(route, /emailRedirectTo:\s*publicSiteUrl\(request\)/);
});

test("seuls owner et admin peuvent inviter un membre", () => {
  assert.match(route, /resolveTeamContext\(context, requestedOrganizationId\(request, body\), \["owner", "admin"\]\)/);
  assert.match(route, /isInvitableRole\(body\.role\)/);
  assert.match(route, /invited_by:\s*context\.user\.id/);
});

test("les valeurs interpolées dans l’e-mail sont échappées", () => {
  assert.match(route, /function escapeHtml/);
  assert.match(route, /safeOrganization = escapeHtml\(organizationName\)/);
  assert.match(route, /safeRole = escapeHtml\(role\)/);
});
