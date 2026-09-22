#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in order via the Supabase Management API
 * (HTTPS), tracking applied files in public.schema_migrations.
 *
 * Needs: SUPABASE_ACCESS_TOKEN (sbp_...) and SUPABASE_PROJECT_REF, or
 * NEXT_PUBLIC_SUPABASE_URL (the ref is derived from it).
 *
 *   node scripts/migrate.mjs            # apply pending
 *   node scripts/migrate.mjs --status   # list applied / pending
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF ??
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

await query(`create table if not exists public.schema_migrations (
  name text primary key, applied_at timestamptz not null default now())`);

const applied = new Set((await query(`select name from public.schema_migrations order by name`)).map((r) => r.name));
const dir = path.resolve("supabase/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

if (process.argv.includes("--status")) {
  for (const f of files) console.log(`${applied.has(f) ? "applied " : "pending "} ${f}`);
  process.exit(0);
}

for (const f of files) {
  if (applied.has(f)) continue;
  const sql = await readFile(path.join(dir, f), "utf8");
  process.stdout.write(`applying ${f} … `);
  // Run the migration and its bookkeeping row in one transaction.
  await query(`begin;\n${sql}\ninsert into public.schema_migrations(name) values ('${f}');\ncommit;`);
  console.log("ok");
}
console.log("done");
