import { DEFAULT_COPILOT_TRADE, resolveCopilotTrade } from "./trade-packs";
import type { CopilotTrade } from "./types";

export const COPILOT_TRADE_STORAGE_KEY = "forgeo:primary-trade";

export function readCopilotTradePreference(storage?: Pick<Storage, "getItem"> | null): CopilotTrade {
  if (!storage) return DEFAULT_COPILOT_TRADE;
  try {
    const resolved = resolveCopilotTrade(storage.getItem(COPILOT_TRADE_STORAGE_KEY));
    return resolved ?? DEFAULT_COPILOT_TRADE;
  } catch {
    return DEFAULT_COPILOT_TRADE;
  }
}

export function writeCopilotTradePreference(
  trade: CopilotTrade,
  storage?: Pick<Storage, "setItem"> | null,
) {
  if (!storage) return;
  try {
    storage.setItem(COPILOT_TRADE_STORAGE_KEY, trade);
  } catch {
    // Le stockage local n'est qu'un pont temporaire vers le futur profil Supabase.
  }
}
