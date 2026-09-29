import "server-only";
import type { Db } from "@/lib/db";
import { readinessScore } from "@/lib/policy/readiness";

const COLS = "id, market_status, communication_status, availability_date, last_verified_at, last_replied_at" as const;

/** Recompute and store readiness for some candidates (after a status change) or a whole org (daily). */
export async function refreshReadiness(db: Db, opts: { orgId?: string; candidateIds?: string[] }) {
  const now = new Date();
  let updated = 0;
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = db.from("candidates").select(COLS).order("id").range(from, from + pageSize - 1);
    if (opts.orgId) q = q.eq("org_id", opts.orgId);
    if (opts.candidateIds) q = q.in("id", opts.candidateIds);
    const { data, error } = await q;
    if (error) throw new Error(`readiness load failed: ${error.message}`);
    const rows = data ?? [];
    if (rows.length) {
      const { data: n, error: e } = await db.rpc("set_readiness", { p_ids: rows.map((c) => c.id), p_scores: rows.map((c) => readinessScore(c, now).score) });
      if (e) throw new Error(`readiness write failed: ${e.message}`);
      updated += n ?? 0;
    }
    if (!data || data.length < pageSize || opts.candidateIds) break;
  }
  return updated;
}

/** Daily sweep: readiness decays with time, so every org is recomputed once a day. */
export async function dailyReadinessSweep(db: Db) {
  const { data: orgs } = await db.from("org_settings").select("org_id");
  let n = 0;
  for (const o of orgs ?? []) n += await refreshReadiness(db, { orgId: o.org_id });
  return n;
}
