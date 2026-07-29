import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${supabasePublicConfig.url}/rest/v1/`, {
      headers: {
        apikey: supabasePublicConfig.publishableKey,
      },
      cache: "no-store",
    });

    return NextResponse.json(
      {
        status: response.ok ? "ok" : "degraded",
        supabaseConfigured: true,
        supabaseReachable: response.ok,
        timestamp: new Date().toISOString(),
      },
      { status: response.ok ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        supabaseConfigured: true,
        supabaseReachable: false,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
