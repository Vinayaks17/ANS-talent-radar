#!/usr/bin/env node
/**
 * Stores the dispatch URL and CRON_SECRET in Supabase Vault for the pg_cron
 * job from 0003_dispatch_schedule.sql. Idempotent: updates existing secrets.
 *
 * Needs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL),
 * APP_URL (the deployed URL, not localhost) and CRON_SECRET (same value as Vercel).
 *
 *   npm run db:cron-secrets
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF ??
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const appUrl = (process.env.CRON_APP_URL ?? process.env.APP_URL ?? "").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}
if (!/^https:\/\//.test(appUrl)) {
  console.error("Set APP_URL (or CRON_APP_URL) to the deployed https:// URL.");
  process.exit(1);
}
if (secret.length < 16) {
  console.error("Set CRON_SECRET (16+ chars, same value as in Vercel).");
  process.exit(1);
}

const lit = (s) => `'${s.replaceAll("'", "''")}'`;

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function upsert(name, value) {
  await query(`do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = ${lit(name)};
  if v_id is null then
    perform vault.create_secret(${lit(value)}, ${lit(name)});
  else
    perform vault.update_secret(v_id, ${lit(value)});
  end if;
end $$;`);
  console.log(`vault: ${name} set`);
}

await upsert("cron_dispatch_url", `${appUrl}/api/cron/dispatch`);
await upsert("cron_secret", secret);
console.log("done");
