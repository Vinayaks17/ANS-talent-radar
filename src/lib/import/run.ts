import "server-only";
import type { Db, Tables } from "@/lib/db";
import type { Json } from "@/lib/database.types";
import type { ImportRow } from "./parse";
import { timezoneFromLocation } from "@/lib/timezone";

export type ImportAnalysis = {
  total: number;
  willCreate: number;
  willUpdate: number;
  suppressed: number;
  duplicateInFile: number;
  invalid: number;
  sample: ImportRow[];
};

async function chunked<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R[]>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))));
  return out;
}

/** Which rows already exist (by email, then phone, then LinkedIn) and which are suppressed. */
export async function analyzeRows(db: Db, orgId: string, rows: ImportRow[]) {
  const emails = rows.map((r) => r.email_normalized);
  const phones = rows.map((r) => r.phone_normalized).filter((p): p is string => !!p);
  const links = rows.map((r) => r.linkedin_url).filter((l): l is string => !!l);

  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byLink = new Map<string, string>();

  const existing = await chunked(emails, 500, async (b) => {
    const { data } = await db.from("candidates").select("id, email_normalized").eq("org_id", orgId).in("email_normalized", b);
    return data ?? [];
  });
  for (const e of existing) byEmail.set(e.email_normalized, e.id);

  if (phones.length) {
    const ex = await chunked(phones, 500, async (b) => {
      const { data } = await db.from("candidates").select("id, phone_normalized").eq("org_id", orgId).in("phone_normalized", b);
      return data ?? [];
    });
    for (const e of ex) if (e.phone_normalized) byPhone.set(e.phone_normalized, e.id);
  }
  if (links.length) {
    const ex = await chunked(links, 500, async (b) => {
      const { data } = await db.from("candidates").select("id, linkedin_url").eq("org_id", orgId).in("linkedin_url", b);
      return data ?? [];
    });
    for (const e of ex) if (e.linkedin_url) byLink.set(e.linkedin_url, e.id);
  }

  const suppressedSet = new Set(
    (await chunked(emails, 500, async (b) => {
      const { data } = await db.from("suppressions").select("identifier").eq("org_id", orgId).eq("channel", "email").in("identifier", b);
      return (data ?? []).map((s) => s.identifier as string);
    })),
  );

  const matchFor = (r: ImportRow) =>
    byEmail.get(r.email_normalized) ?? (r.phone_normalized ? byPhone.get(r.phone_normalized) : undefined) ?? (r.linkedin_url ? byLink.get(r.linkedin_url) : undefined) ?? null;

  return { matchFor, suppressedSet };
}

export async function analyzeImport(db: Db, orgId: string, rows: ImportRow[], meta: { duplicateInFile: number; invalid: number }): Promise<ImportAnalysis> {
  const { matchFor, suppressedSet } = await analyzeRows(db, orgId, rows);
  let willCreate = 0, willUpdate = 0, suppressed = 0;
  for (const r of rows) {
    if (matchFor(r)) willUpdate++; else willCreate++;
    if (suppressedSet.has(r.email_normalized)) suppressed++;
  }
  return { total: rows.length, willCreate, willUpdate, suppressed, duplicateInFile: meta.duplicateInFile, invalid: meta.invalid, sample: rows.slice(0, 8) };
}

export async function commitImport(
  db: Db,
  orgId: string,
  userId: string,
  rows: ImportRow[],
  meta: { filename: string; duplicateInFile: number; invalid: { line: number; reason: string }[] },
) {
  const { matchFor, suppressedSet } = await analyzeRows(db, orgId, rows);

  // Resolve owner emails to user ids within this org
  const ownerEmails = [...new Set(rows.map((r) => r.owner_email).filter((e): e is string => !!e))];
  const owners = new Map<string, string>();
  if (ownerEmails.length) {
    const { data } = await db.rpc("resolve_member_emails", { p_org: orgId, p_emails: ownerEmails });
    for (const o of (data ?? []) as { email: string; user_id: string }[]) owners.set(o.email, o.user_id);
  }

  type Insert = Omit<Tables<"candidates">, "id" | "created_at" | "updated_at"> extends infer T ? Partial<T> & { org_id: string; email: string; email_normalized: string } : never;
  const toInsert: Insert[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
  let suppressedCount = 0;

  for (const r of rows) {
    const isSuppressed = suppressedSet.has(r.email_normalized);
    if (isSuppressed) suppressedCount++;
    const base = {
      first_name: r.first_name, last_name: r.last_name, phone: r.phone, phone_normalized: r.phone_normalized,
      linkedin_url: r.linkedin_url, current_title: r.current_title, current_company: r.current_company,
      location: r.location, timezone: timezoneFromLocation(r.location), skills: r.skills, industry: r.industry,
      source: r.source ?? "csv_import", owner_user_id: r.owner_email ? owners.get(r.owner_email) ?? null : null,
      last_contacted_at: r.last_contacted_at, notes: r.notes,
    };
    const existingId = matchFor(r);
    if (existingId) {
      // Fill blanks only; never overwrite what a recruiter or a reply has already told us.
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) if (v != null && !(Array.isArray(v) && v.length === 0)) patch[k] = v;
      toUpdate.push({ id: existingId, patch });
    } else {
      toInsert.push({
        org_id: orgId, email: r.email, email_normalized: r.email_normalized, ...base,
        communication_status: isSuppressed ? "SUPPRESSED" : "NOT_CONTACTED",
        market_status: isSuppressed ? "NOT_INTERESTED" : "UNKNOWN",
      });
    }
  }

  let created = 0, updated = 0;
  const errors: { line?: number; reason: string }[] = meta.invalid.map((i) => ({ line: i.line, reason: i.reason }));

  await chunked(toInsert, 500, async (batch) => {
    const { error, count } = await db.from("candidates").insert(batch, { count: "exact" });
    if (error) errors.push({ reason: `insert batch failed: ${error.message}` }); else created += count ?? batch.length;
    return [];
  });

  for (const u of toUpdate) {
    if (Object.keys(u.patch).length === 0) continue;
    const { error } = await db.rpc("fill_candidate_blanks", { p_id: u.id, p_patch: u.patch as Json });
    if (error) errors.push({ reason: `update ${u.id} failed: ${error.message}` }); else updated++;
  }

  const { data: imp } = await db.from("imports").insert({
    org_id: orgId, filename: meta.filename, row_count: rows.length + meta.duplicateInFile + meta.invalid.length,
    created_count: created, updated_count: updated, skipped_duplicate: meta.duplicateInFile,
    skipped_suppressed: suppressedCount, skipped_invalid: meta.invalid.length, errors: errors as Json, created_by: userId,
  }).select("id").single();

  return { importId: imp?.id ?? null, created, updated, suppressed: suppressedCount, duplicateInFile: meta.duplicateInFile, invalid: meta.invalid.length, errors };
}
