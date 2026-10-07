import { createServer } from 'node:http';

if (process.env.MANUFEO_LOCAL_HTTP_TEST !== '1') {
  throw new Error('This backend fixture is reserved for local browser tests.');
}

// Interface tests keep their seeded workspace when the cloud is unavailable.
// A bounded HTTP failure exercises that fallback without SDK connection retries.
createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
  response.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,x-retry-count,prefer');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.url === '/e2e-health') {
    response.end(JSON.stringify({ fixture: 'offline-backend' }));
    return;
  }
  // Authentication is simulated only by this loopback backend; business data
  // remains unavailable so interface tests keep exercising the local fallback.
  if (request.url?.startsWith('/auth/v1/user')) {
    response.end(JSON.stringify({ id: '22222222-2222-4222-8222-222222222222', email: 'fixture@audit.invalid' })); return;
  }
  if (request.url?.startsWith('/rest/v1/organization_members')) {
    response.end(JSON.stringify([{ organization_id: '11111111-1111-4111-8111-111111111111', role: 'owner' }])); return;
  }
  if (request.url?.startsWith('/rest/v1/rpc/manufeo_session_active') || request.url?.startsWith('/rest/v1/rpc/manufeo_consume_ai_quota')) {
    response.end('true'); return;
  }
  response.writeHead(400).end(JSON.stringify({ code: 'E2E_BACKEND_UNAVAILABLE', message: 'Backend local indisponible pour ce test d’interface' }));
}).listen(54321, '127.0.0.1');
