#!/usr/bin/env node
/** Regenerates src/lib/database.types.ts via the Supabase Management API (no CLI needed). */
import { writeFile } from "node:fs/promises";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF ?? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !ref) { console.error("Set SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL."); process.exit(1); }
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`types: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
const { types } = await res.json();
await writeFile(new URL("../src/lib/database.types.ts", import.meta.url), types);
console.log("wrote src/lib/database.types.ts");
