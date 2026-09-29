import "server-only";
import { z } from "zod";
import type { Db, Tables } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertAiAvailable, modelFor, runStructured } from "@/lib/ai/client";
import { combinedMatchScore, readinessScore, requirementTerms } from "@/lib/policy/readiness";

const BATCH = 10;
const SHORTLIST_POOL = 40;

const fitSchema = z.object({
  results: z.array(z.object({
    ref: z.string(),
    role_fit: z.number().min(0).max(100),
    strengths: z.array(z.string().max(200)).max(5),
    gaps: z.array(z.string().max(200)).max(5),
    summary: z.string().max(400),
  })),
});
const str = { type: "string" } as const;
const fitJsonSchema = {
  type: "object", additionalProperties: false, required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["ref", "role_fit", "strengths", "gaps", "summary"],
        properties: { ref: str, role_fit: { type: "number" }, strengths: { type: "array", items: str }, gaps: { type: "array", items: str }, summary: str },
      },
    },
  },
};

type Cand = Pick<Tables<"candidates">, "id" | "current_title" | "current_company" | "location" | "industry" | "skills" | "preferred_roles" | "preferred_locations" | "remote_preference" | "target_salary" | "notice_period" | "memory_summary" | "market_status" | "communication_status" | "availability_date" | "last_verified_at" | "last_replied_at">;
const CAND_COLS = "id, current_title, current_company, location, industry, skills, preferred_roles, preferred_locations, remote_preference, target_salary, notice_period, memory_summary, market_status, communication_status, availability_date, last_verified_at, last_replied_at";

/** What the model sees: work facts only — no name, email, phone or protected traits. */
function candidateCard(c: Cand, ref: string) {
  return {
    ref, title: c.current_title, company: c.current_company, location: c.location, industry: c.industry,
    skills: c.skills.slice(0, 25), preferred_roles: c.preferred_roles, preferred_locations: c.preferred_locations,
    remote_preference: c.remote_preference, target_compensation: c.target_salary, notice_period: c.notice_period,
    memory: c.memory_summary?.slice(0, 600) ?? null,
  };
}

export type MatchRun = { considered: number; scored: number; costUsd: number; model: string };

/**
 * Requirement → ranked matches. Code narrows the pool (full-text + readiness),
 * the AI scores role fit only, code combines it with readiness and stores it.
 */
export async function runMatching(db: Db, a: { orgId: string; requirementId: string; userId: string | null }): Promise<MatchRun> {
  const [{ data: req }, { data: settings }] = await Promise.all([
    db.from("requirements").select("*").eq("id", a.requirementId).eq("org_id", a.orgId).single(),
    db.from("org_settings").select("*").eq("org_id", a.orgId).single(),
  ]);
  if (!req || !settings) throw new Error("requirement or settings not found");
  await assertAiAvailable(db, settings);
  const now = new Date();

  // 1. Prefilter: full-text on title/skills/roles, then keep the best by text rank blended with readiness.
  const terms = requirementTerms(req);
  const { data: hits, error: pfErr } = await db.rpc("match_candidates_prefilter", { p_org: a.orgId, p_terms: terms, p_limit: 200 });
  if (pfErr) throw new Error(`prefilter failed: ${pfErr.message}`);
  let pool: Cand[] = [];
  const rank = new Map((hits ?? []).map((h) => [h.id, h.rank]));
  if (rank.size) {
    const { data } = await db.from("candidates").select(CAND_COLS).in("id", [...rank.keys()]);
    pool = data ?? [];
  }
  if (pool.length < 10) {
    // Thin profiles (e.g. a fresh import): top up with the most ready contactable candidates.
    const { data } = await db.from("candidates").select(CAND_COLS).eq("org_id", a.orgId).neq("communication_status", "SUPPRESSED").neq("market_status", "NOT_INTERESTED")
      .order("readiness_score", { ascending: false, nullsFirst: false }).limit(SHORTLIST_POOL);
    for (const c of data ?? []) if (!pool.some((p) => p.id === c.id)) pool.push(c);
  }
  const maxRank = Math.max(1e-6, ...[...rank.values()]);
  const scored = pool.map((c) => ({ c, ready: readinessScore(c, now).score, text: (rank.get(c.id) ?? 0) / maxRank }))
    .sort((x, y) => (y.text * 0.7 + (y.ready / 100) * 0.3) - (x.text * 0.7 + (x.ready / 100) * 0.3))
    .slice(0, SHORTLIST_POOL);
  if (!scored.length) return { considered: 0, scored: 0, costUsd: 0, model: modelFor(settings, "match") };

  // 2. Role fit in batches (parallel), model per org settings (Terra by default).
  const model = modelFor(settings, "match");
  const requirement = {
    title: req.title, client: req.client_name, location: req.location, remote_policy: req.remote_policy,
    compensation: req.comp_min || req.comp_max ? { currency: req.currency, min: req.comp_min, max: req.comp_max } : null,
    must_have: req.must_have, nice_to_have: req.nice_to_have, description: req.description?.slice(0, 3000) ?? null,
  };
  const batches: (typeof scored)[] = [];
  for (let i = 0; i < scored.length; i += BATCH) batches.push(scored.slice(i, i + BATCH));
  let cost = 0, promptVersion = "";
  const results = new Map<string, z.infer<typeof fitSchema>["results"][number]>();
  await Promise.all(batches.map(async (batch, bi) => {
    const refs = batch.map((_, i) => `c${bi * BATCH + i + 1}`);
    const r = await runStructured(db, {
      orgId: a.orgId, candidateId: null, action: "match", model, promptName: "role_fit_scorer", schemaName: "role_fit",
      schema: fitSchema, jsonSchema: fitJsonSchema,
      input: { requirement, candidates: batch.map((b, i) => candidateCard(b.c, refs[i])) },
    });
    cost += r.costUsd; promptVersion = r.promptVersion;
    for (const res of r.data.results) {
      const idx = refs.indexOf(res.ref);
      if (idx >= 0) results.set(batch[idx].c.id, res);
    }
  }));

  // 3. Store: replace earlier suggestions, keep shortlist/reject decisions people already made.
  await db.from("requirement_matches").delete().eq("requirement_id", req.id).eq("status", "SUGGESTED");
  const rows = scored.filter((s) => results.has(s.c.id)).map((s) => {
    const r = results.get(s.c.id)!;
    const fit = Math.round(r.role_fit);
    return {
      org_id: a.orgId, requirement_id: req.id, candidate_id: s.c.id, role_fit: fit, readiness: s.ready,
      match_score: combinedMatchScore(fit, s.ready), summary: r.summary, strengths: r.strengths.slice(0, 3), gaps: r.gaps.slice(0, 3),
      model, prompt_version: promptVersion,
    };
  });
  if (rows.length) {
    const { error } = await db.from("requirement_matches").upsert(rows, { onConflict: "requirement_id,candidate_id" });
    if (error) throw new Error(`storing matches failed: ${error.message}`);
  }
  await db.from("requirements").update({ last_matched_at: now.toISOString() }).eq("id", req.id);
  await audit(db, {
    orgId: a.orgId, eventType: "MATCH_RUN", actor: "AI", actorUserId: a.userId, model, promptVersion,
    inputRef: req.id, decision: `${rows.length} scored`, reason: `${scored.length} considered from ${pool.length} prefiltered · terms: ${terms.slice(0, 8).join(", ")}`,
    metadata: { cost_usd: Number(cost.toFixed(6)) },
  });
  return { considered: scored.length, scored: rows.length, costUsd: cost, model };
}
