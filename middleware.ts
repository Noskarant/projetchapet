import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOriginMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  if (fetchSite === "same-origin") return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === request.nextUrl.protocol
      && originUrl.host === request.nextUrl.host;
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

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
