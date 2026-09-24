import "server-only";
import type { Db, Tables } from "@/lib/db";
import type { Database, Json } from "@/lib/database.types";
import type { Classification } from "./schemas";

type Candidate = Tables<"candidates">;
type CandidateUpdate = Database["public"]["Tables"]["candidates"]["Update"];

/**
 * Store every extracted fact with provenance (always), then promote the
 * confident ones onto the candidate record. Facts are intelligence, not
 * decisions, so this runs whatever the reply route is — except the quote must
 * actually appear in the reply (guards against the model inventing facts).
 */
export async function applyIntelligence(db: Db, a: {
  candidate: Candidate; c: Classification; replyText: string; messageId: string; minConfidence: number; applyStatus: boolean; model: string;
}) {
  const { candidate, c } = a;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const reply = norm(a.replyText);
  const facts = c.facts.filter((f) => f.quote.trim() && reply.includes(norm(f.quote).slice(0, 80)));
  const dropped = c.facts.length - facts.length;

  if (facts.length) {
    await db.from("candidate_facts").insert(facts.map((f) => ({
      org_id: candidate.org_id, candidate_id: candidate.id, fact_type: f.type, source: "EMAIL" as const,
      source_message_id: a.messageId, confidence: Number(f.confidence.toFixed(2)),
      value_json: { value: f.value, quote: f.quote, ...(f.amount != null ? { amount: f.amount, currency: f.currency ?? "USD", is_minimum: f.is_minimum } : {}), ...(f.items?.length ? { items: f.items } : {}), model: a.model } as Json,
    })));
  }

  const now = new Date().toISOString();
  const patch: CandidateUpdate = { last_replied_at: now, last_verified_at: now };
  if (c.memory.trim()) patch.memory_summary = c.memory.trim();

  if (a.applyStatus) {
    if (c.market_status !== "UNKNOWN") patch.market_status = c.market_status;
    if (c.availability && reply.includes(norm(c.availability.quote).slice(0, 80))) {
      patch.availability_date = c.availability.date;
      patch.availability_precision = c.availability.precision;
    }
    for (const f of facts.filter((x) => x.confidence >= a.minConfidence)) {
      switch (f.type) {
        case "TARGET_COMPENSATION": if (f.amount) patch.target_salary = { currency: f.currency ?? "USD", ...(f.is_minimum ? { minimum: f.amount } : { amount: f.amount }) }; break;
        case "CURRENT_COMPENSATION": if (f.amount) patch.current_salary = { currency: f.currency ?? "USD", amount: f.amount }; break;
        case "PREFERRED_ROLES": if (f.items?.length) patch.preferred_roles = f.items.slice(0, 10); break;
        case "PREFERRED_LOCATIONS": if (f.items?.length) patch.preferred_locations = f.items.slice(0, 10); break;
        case "REMOTE_PREFERENCE": patch.remote_preference = f.value.slice(0, 120); break;
        case "NOTICE_PERIOD": patch.notice_period = f.value.slice(0, 120); break;
        case "CURRENT_EMPLOYER": patch.current_company = f.value.slice(0, 200); break;
        case "CURRENT_TITLE": patch.current_title = f.value.slice(0, 200); break;
        case "SKILLS": if (f.items?.length) patch.skills = [...new Set([...candidate.skills, ...f.items])].slice(0, 40); break;
      }
    }
  }
  const { error } = await db.from("candidates").update(patch).eq("id", candidate.id);
  if (error) throw new Error(`candidate update failed: ${error.message}`);
  return { factsStored: facts.length, factsDropped: dropped, fields: Object.keys(patch).filter((k) => !["last_replied_at", "last_verified_at"].includes(k)) };
}
