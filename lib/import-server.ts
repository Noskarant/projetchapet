import { createClient } from "@supabase/supabase-js";
import { ApiInputError } from "@/lib/api-guard";

export function importServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new ApiInputError("Centre d’import MANUFEO non configuré.", 503);
  }
  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
