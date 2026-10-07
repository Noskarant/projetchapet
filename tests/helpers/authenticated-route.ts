/** Supabase boundary fixture: production code still performs every auth check. */
export function authenticatedRoute(handler: (request: Request) => Promise<Response>, fixture = true) {
  return async (request: Request) => {
    const priorFetch = globalThis.fetch;
    const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-local-only";
    const token = `fixture.${Buffer.from(JSON.stringify({ session_id: "33333333-3333-4333-8333-333333333333" })).toString("base64url")}.signature`;
    const headers = new Headers(request.headers);
    if (fixture || headers.has("authorization")) headers.set("Authorization", `Bearer ${token}`);
    globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/rpc/manufeo_session_active") || url.includes("/rpc/manufeo_consume_ai_quota")) return Response.json(true);
      if (fixture && url.includes("/auth/v1/user")) return Response.json({ id: "22222222-2222-4222-8222-222222222222" });
      if (fixture && url.includes("/organization_members")) return Response.json([{ organization_id: "11111111-1111-4111-8111-111111111111", role: "owner" }]);
      return priorFetch(input, init);
    };
    try { return await handler(new Request(request, { headers })); }
    finally {
      globalThis.fetch = priorFetch;
      if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
    }
  };
}
