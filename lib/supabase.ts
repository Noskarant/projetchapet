import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/supabase-config";

export const supabase = createClient(
  supabasePublicConfig.url,
  supabasePublicConfig.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export { supabasePublicConfig } from "@/lib/supabase-config";
