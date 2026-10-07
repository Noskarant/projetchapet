import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // The REST schema endpoint requires a secret key; it is not a public health probe.
    const response = await fetch(`${supabasePublicConfig.url}/auth/v1/health`, {
      headers: {
        apikey: supabasePublicConfig.publishableKey,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    return NextResponse.json(
      {
        status: response.ok ? "ok" : "degraded",
        supabaseConfigured: true,
        supabaseReachable: response.ok,
        probe: "auth",
        timestamp: new Date().toISOString(),
      },
      { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        supabaseConfigured: true,
        supabaseReachable: false,
        probe: "auth",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
