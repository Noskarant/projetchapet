type SupabasePublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

const FALLBACK_SUPABASE_URL = "https://mdpmpuurdhdmeupqsmal.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JRp1qHa87O5-bnHiWeZEqQ_4EANKzkN";

export function resolveSupabasePublicConfig(env: SupabasePublicEnvironment = process.env) {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL?.trim() || FALLBACK_SUPABASE_URL,
    publishableKey:
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      FALLBACK_SUPABASE_PUBLISHABLE_KEY,
  };
}

export const supabasePublicConfig = resolveSupabasePublicConfig();
