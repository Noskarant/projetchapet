import { NextResponse } from "next/server";
import { ARTISAN_TRADE_CATALOG } from "@/lib/copilot/trade-catalog";
import { listAvailableCopilotTradePacks } from "@/lib/copilot/trade-packs";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    availablePacks: listAvailableCopilotTradePacks(),
    trades: ARTISAN_TRADE_CATALOG,
  });
}
