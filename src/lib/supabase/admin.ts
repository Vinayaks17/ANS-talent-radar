import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS. Use ONLY in workers, webhooks and cron
 * handlers, and always pass an explicit org_id in every query.
 */
export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const e = env();
  admin = createSupabaseClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
