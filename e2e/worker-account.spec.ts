import { test, expect, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';

// Exercise real auth routing with RLS-shaped responses, without an auth bypass.
const root = path.resolve(__dirname, '..');
const bundle = buildSync({ stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Gate from './app/pilot-auth-gate';
createRoot(document.getElementById('root')).render(<Gate><h1>Accueil de gestion</h1></Gate>);
` }, bundle: true, write: false, outdir: '/tmp/worker-account-bundle', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://worker-backend.manufeo.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-key' }) },
  tsconfig: path.join(root, 'tsconfig.json') }).outputFiles;
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${bundle.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}</style></head><body><div id="root"></div><script>${bundle.find(file => file.path.endsWith('.js'))!.text.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
const user = { id: '22222222-2222-4222-8222-222222222222', email: 'terrain@example.com', user_metadata: {}, app_metadata: {}, aud: 'authenticated', created_at: '2026-09-14T00:00:00Z' };
const organization = { id: '11111111-1111-4111-8111-111111111111', name: 'Entreprise de test' };
async function fixture(page: Page, role = 'worker', status = 503) {
  await page.addInitScript((user) => {
    localStorage.setItem('sb-worker-backend-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
  }, user);
  const state = { status, calls: 0, signouts: 0, snapshotWrites: 0, projects: [] as Array<object> };
  await page.route('https://worker-backend.manufeo.test/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/logout')) { state.signouts++; return route.fulfill({ json: {} }); }
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/ensure_personal_organization')) return route.fulfill({ json: organization.id });
    if (url.pathname.endsWith('/organizations')) return route.fulfill({ json: organization });
    if (url.pathname.endsWith('/organization_members')) return route.fulfill({ json: { role } });
    if (url.pathname.endsWith('/pilot_workspace_snapshots')) {
      if (route.request().method() === 'POST') state.snapshotWrites++;
      return route.fulfill({ json: route.request().method() === 'POST' ? { updated_at: new Date().toISOString() } : null });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('https://worker-account.manufeo.test/**', route => {
    if (new URL(route.request().url()).pathname === '/api/worker-workspace') {
      state.calls++;
      expect(route.request().headers().authorization).toBe('Bearer test-token');
      return route.fulfill({ status: state.status, json: state.status === 200 ? { projects: state.projects, steps: [], photos: [] } : { error: 'internal technical detail' } });
    }
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('https://worker-account.manufeo.test/');
  return state;
}

test('un salarié peut consulter son compte et se déconnecter même si les chantiers ne chargent pas', async ({ page }) => {
  const state = await fixture(page);
  await expect(page.getByRole('alert')).toContainText('Chargement des chantiers indisponible');
  await expect(page.locator('.worker-account-info')).toContainText('terrain@example.com');
  await expect(page.getByText('Aucun chantier affecté.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('alert')).not.toContainText('internal technical detail');
  await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Compte FORGEO' });
  await expect(account).toContainText('terrain@example.com');
  await account.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(page.locator('.worker-app')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible();
  expect(state.signouts).toBe(1);
  expect(state.snapshotWrites).toBe(0);
});

test('réessayer efface l’erreur et affiche les chantiers affectés', async ({ page }) => {
  const state = await fixture(page);
  await expect(page.getByRole('alert')).toBeVisible();
  state.status = 200;
  state.projects = [{ id: 'chantier-1', name: 'Cuisine Durand', address: 'Lyon', subtitle: 'Peinture', status: 'En cours' }];
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cuisine Durand' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(state.calls).toBe(2);
  expect(state.snapshotWrites).toBe(0);
});

test('aucun chantier s’affiche uniquement après un chargement réussi', async ({ page }) => {
  await fixture(page, 'worker', 200);
  await expect(page.getByText('Aucun chantier affecté.', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [status, text] of [[401, 'Votre session a expiré'], [403, 'Ce compte n’a pas accès']] as const) {
  test(`statut ${status} : message adapté et compte accessible`, async ({ page }) => {
    await fixture(page, 'worker', status);
    await expect(page.getByRole('alert')).toContainText(text);
    await expect(page.getByText('Aucun chantier affecté.', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Compte FORGEO' })).toBeVisible();
  });
}

test('le propriétaire conserve l’accueil de gestion et ne charge pas l’espace salarié', async ({ page }) => {
  const state = await fixture(page, 'owner');
  await expect(page.getByRole('heading', { name: 'Accueil de gestion', exact: true })).toBeVisible();
  await expect(page.locator('.worker-app')).toHaveCount(0);
  expect(state.calls).toBe(0);
});
