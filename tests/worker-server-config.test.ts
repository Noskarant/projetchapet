import assert from 'node:assert/strict';
import test from 'node:test';
import { createServiceSupabase, OrganizationAuthError } from '../lib/server-organization';
import { supabasePublicConfig } from '../lib/supabase-config';

test('les services terrain utilisent la même URL Supabase que le client', () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
    const { data } = createServiceSupabase().storage.from('test').getPublicUrl('photo.png');
    assert.equal(data.publicUrl, `${supabasePublicConfig.url}/storage/v1/object/public/test/photo.png`);
  } finally {
    if (original === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('une clé serveur absente reste une indisponibilité, sans contournement des droits', () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => createServiceSupabase(), (error: unknown) => error instanceof OrganizationAuthError && error.status === 503);
  } finally {
    if (original !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('les API terrain conservent les statuts 401 et 503 au lieu d’un faux 500', async () => {
  const { GET, POST } = await import('../app/api/worker-workspace/route');
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    for (const [key, expected] of [[undefined, 503], ['local-test-key', 401]] as const) {
      if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
      for (const handler of [GET, POST]) {
        const response = await handler(new Request('https://manufeo.test/api/worker-workspace'));
        assert.equal(response.status, expected);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
    }
  } finally {
    if (original === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});
