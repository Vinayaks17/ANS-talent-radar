import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

export type AdminClient = SupabaseClient<Database>;
let admin: AdminClient | null = null;

/**
 * Service-role client. Bypasses RLS. Use ONLY in workers, webhooks and cron
 * handlers, and always pass an explicit org_id in every query.
 */
export function adminClient(): AdminClient {
  if (admin) return admin;
  const e = env();
  admin = createSupabaseClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
