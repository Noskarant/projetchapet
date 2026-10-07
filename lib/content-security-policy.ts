/** Keep the browser policy explicit; provider credentials stay on the server. */
export function contentSecurityPolicy(nonce: string, development = false, localTests = false) {
  const localConnections = localTests ? " http://127.0.0.1:54321 ws://127.0.0.1:3000" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://api.bigdatacloud.net${localConnections}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
    ...(!development && !localTests ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
