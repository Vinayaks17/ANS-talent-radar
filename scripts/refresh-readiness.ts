/** Recompute readiness scores for every org (the cron does this daily at 03:00 UTC). npm run db:readiness */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

async function main() {
  process.env.CRON_SECRET ??= "x".repeat(20);
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { dailyReadinessSweep } = await import("../src/lib/matching/readiness");
  console.log(`readiness updated for ${await dailyReadinessSweep(db)} candidates`);
}
main().catch((e) => { console.error(e); process.exit(1); });
