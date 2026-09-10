import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  commercialCloudSignature,
  commercialPhotoPath,
  commercialStateToPayload,
  mergeConcurrentCommercialState,
  mergeInitialCommercialState,
} from "../lib/commercial-cloud";
import {
  seedCommercialDemoState,
  type CommercialDemoState,
  type CommercialProject,
  type CommercialProjectPhoto,
} from "../lib/mobile-commercial-demo";

type CloudPhoto = CommercialProjectPhoto & { storagePath?: string };

const ORG_ID = "11111111-2222-4333-8444-555555555555";

function photo(id = "PHOTO-1", dataUrl = "https://signed.example/a", storagePath = `${ORG_ID}/PROJECT-1/${id}.jpg`): CloudPhoto {
  return {
    id,
    name: `${id}.jpg`,
    caption: "Photo chantier",
    createdAt: "2026-09-09T12:00:00.000Z",
    dataUrl,
    storagePath,
  };
}

function project(overrides: Partial<CommercialProject> = {}): CommercialProject {
  return {
    id: "PROJECT-1",
    name: "Chantier Bellevue",
    subtitle: "Rénovation",
    customerId: "CUSTOMER-1",
    quoteId: "QUOTE-1",
    invoiceId: undefined,
    address: "1 rue du Test",
    status: "En cours",
    startDate: "2026-09-01",
    nextVisit: "2026-09-10",
    teamIds: ["COLLAB-1"],
    steps: [{ id: "STEP-1", label: "Préparation", assigneeId: "COLLAB-1", dueDate: "2026-09-10", done: false }],
    issues: [],
    photos: [photo()],
    ...overrides,
  };
}

function state(projects: CommercialProject[] = [project()]): CommercialDemoState {
  const base = seedCommercialDemoState();
  return {
    ...base,
    collaborators: [{ id: "COLLAB-1", name: "Alice Martin", role: "Peintre", phone: "0600000000", initials: "AM", active: true }],
    projects,
    activity: [{ id: "ACT-1", kind: "chantier", message: "Chantier créé", createdAt: "2026-09-09T12:00:00.000Z", projectId: "PROJECT-1" }],
  };
}

test("la signature cloud ignore les réglages locaux, les filtres et les URL signées", () => {
  const baseline = state();
  const changed = structuredClone(baseline);
  changed.company.displayName = "Entreprise locale différente";
  changed.filters.quote.status = "Validé";
  changed.projects[0].photos[0].dataUrl = "https://signed.example/renouvellee";

  assert.equal(commercialCloudSignature(changed), commercialCloudSignature(baseline));
});

test("la signature cloud détecte les vraies modifications chantier et stockage", () => {
  const baseline = state();
  const stepChanged = structuredClone(baseline);
  stepChanged.projects[0].steps[0].done = true;
  assert.notEqual(commercialCloudSignature(stepChanged), commercialCloudSignature(baseline));

  const storageChanged = structuredClone(baseline) as CommercialDemoState;
  (storageChanged.projects[0].photos[0] as CloudPhoto).storagePath = `${ORG_ID}/PROJECT-1/autre.jpg`;
  assert.notEqual(commercialCloudSignature(storageChanged), commercialCloudSignature(baseline));

  const activityChanged = structuredClone(baseline);
  activityChanged.activity[0].message = "Étape terminée";
  assert.notEqual(commercialCloudSignature(activityChanged), commercialCloudSignature(baseline));
});

test("la première migration conserve les données présentes d'un seul côté sans écraser le serveur", () => {
  const server = state();
  const localOnly = project({ id: "PROJECT-LOCAL", name: "Chantier mobile uniquement", photos: [] });
  const local = state([
    project({ name: "Ancienne copie locale" }),
    localOnly,
  ]);

  const merged = mergeInitialCommercialState(server, local);
  assert.equal(merged.projects.length, 2);
  assert.equal(merged.projects.find((item) => item.id === "PROJECT-1")?.name, "Chantier Bellevue");
  assert.equal(merged.projects.find((item) => item.id === "PROJECT-LOCAL")?.name, "Chantier mobile uniquement");
});

test("une résolution de conflit fusionne les modifications indépendantes du même chantier", () => {
  const baseline = state([project({ photos: [] })]);
  const local = structuredClone(baseline);
  local.projects[0].steps[0].done = true;
  const server = structuredClone(baseline);
  server.projects[0].photos = [photo("PHOTO-SERVER")];
  server.projects[0].issues = [{
    id: "ISSUE-SERVER",
    title: "Support humide",
    detail: "À contrôler",
    severity: "À surveiller",
    resolved: false,
    createdAt: "2026-09-09T13:00:00.000Z",
  }];

  const merged = mergeConcurrentCommercialState(baseline, local, server);
  assert.equal(merged.projects[0].steps[0].done, true);
  assert.equal(merged.projects[0].photos[0].id, "PHOTO-SERVER");
  assert.equal(merged.projects[0].issues[0].id, "ISSUE-SERVER");
});

test("un renouvellement d'URL signée ne fait pas revenir un ancien nom de chantier", () => {
  const baseline = state();
  const local = structuredClone(baseline);
  local.projects[0].photos[0].dataUrl = "https://signed.example/local-renewed";
  const server = structuredClone(baseline);
  server.projects[0].name = "Nom modifié depuis un autre appareil";
  server.projects[0].photos[0].dataUrl = "https://signed.example/server-renewed";

  const merged = mergeConcurrentCommercialState(baseline, local, server);
  assert.equal(merged.projects[0].name, "Nom modifié depuis un autre appareil");
  assert.equal(merged.projects[0].photos[0].dataUrl, "https://signed.example/server-renewed");
});

test("le payload cloud exclut les Data URL mais conserve le chemin privé", () => {
  const fixture = state();
  fixture.projects[0].photos[0].dataUrl = "data:image/jpeg;base64,AAAA";
  const payload = commercialStateToPayload(fixture);
  const cloudPhoto = payload.projects[0].photos[0] as Record<string, unknown>;

  assert.equal("dataUrl" in cloudPhoto, false);
  assert.equal(cloudPhoto.storagePath, `${ORG_ID}/PROJECT-1/PHOTO-1.jpg`);
});

test("les chemins de photo restent sous l'organisation et neutralisent les caractères dangereux", () => {
  assert.equal(
    commercialPhotoPath(ORG_ID, "../Projet Client", "photo / 1", "image/png"),
    `${ORG_ID}/Projet_Client/photo_1.png`,
  );
});

test("la migration verrouille RLS, stockage privé, concurrence et références", () => {
  const sql = fs.readFileSync("supabase/migrations/20260910092958_cloud_commercial_projects.sql", "utf8");
  for (const table of [
    "commercial_workspace_meta",
    "commercial_collaborators",
    "commercial_projects",
    "commercial_project_members",
    "commercial_project_steps",
    "commercial_project_issues",
    "commercial_project_photos",
    "commercial_activity_events",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
  }
  assert.match(sql, /grant select on table public\.commercial_projects to authenticated/i);
  assert.match(sql, /'commercial-project-photos'[\s\S]+false[\s\S]+image\/jpeg/i);
  assert.match(sql, /on storage\.objects for select to authenticated/i);
  assert.match(sql, /on storage\.objects for insert to authenticated/i);
  assert.match(sql, /private\.is_org_member\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/i);
  assert.match(sql, /if auth\.uid\(\) is null then[\s\S]+authentication required/i);
  assert.match(sql, /current_revision <> coalesce\(p_expected_revision, 0\)/i);
  assert.match(sql, /errcode = '40001'.+commercial workspace conflict/i);
  assert.match(sql, /unknown commercial collaborator reference/i);
  assert.match(sql, /invalid nested commercial item/i);
  assert.doesNotMatch(sql, /foreign key \(organization_id, assignee_id\)/i);
  assert.match(sql, /revoke execute on function public\.replace_commercial_workspace\(jsonb, bigint\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.replace_commercial_workspace\(jsonb, bigint\) to authenticated/i);
});
