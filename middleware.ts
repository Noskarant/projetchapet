import { contentSecurityPolicy } from "./lib/content-security-policy";
import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOriginMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    // Next may normalize the internal URL to localhost behind a proxy. Host
    // retains the browser-facing authority; browsers cannot forge that header.
    const authority = request.headers.get("host") || request.nextUrl.host;
    const protocol = process.env.VERCEL === "1" ? "https:" : request.nextUrl.protocol;
    return originUrl.protocol === protocol && originUrl.host === authority;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (!SAFE_METHODS.has(request.method) && !isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "Origine de requête refusée." },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, nosnippet",
        },
      },
    );
  }

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", process.env.MANUFEO_LOCAL_HTTP_TEST === "1");
  const headers = new Headers(request.headers);
  // Next extracts this server-generated nonce for its framework/hydration scripts.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:css|js|mjs|svg|webp|png|jpg|jpeg|ico|woff2?|webmanifest)$).*)",
};
