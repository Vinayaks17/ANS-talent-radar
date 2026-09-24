import "server-only";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validateNextContact } from "@/lib/policy/eligibility";
import { isSuppressed } from "@/lib/policy/suppression";

/**
 * Turn a recommended reconnect date into a RECONNECT action — only if the
 * policy allows it. `statusAfter` is the communication status the candidate
 * will have once the current step is done (so a live conversation that is
 * being closed does not block its own follow-up).
 */
export async function scheduleReconnect(db: Db, a: {
  orgId: string; candidateId: string; conversationId: string | null; at: Date; statusAfter: string; label: string; actorUserId?: string | null;
}): Promise<{ ok: true; at: Date } | { ok: false; reason: string }> {
  const [{ data: cand }, { data: settings }, { data: pending }] = await Promise.all([
    db.from("candidates").select("email_normalized, market_status, last_contacted_at").eq("id", a.candidateId).single(),
    db.from("org_settings").select("min_gap_hours").eq("org_id", a.orgId).single(),
    db.from("scheduled_actions").select("id").eq("candidate_id", a.candidateId).in("status", ["PENDING", "PROCESSING"])
      .in("action_type", ["SEND_INITIAL", "SEND_FOLLOW_UP", "SEND_FINAL", "SEND_NURTURE", "RECONNECT"]).limit(1),
  ]);
  if (!cand || !settings) return { ok: false, reason: "missing rows" };

  const verdict = validateNextContact({
    proposed: a.at, now: new Date(), followUpAllowed: cand.market_status !== "NOT_INTERESTED",
    isSuppressed: await isSuppressed(db, a.orgId, cand.email_normalized), campaignActive: true,
    hasPendingSend: (pending ?? []).length > 0, communicationStatus: a.statusAfter,
    minGapHours: settings.min_gap_hours, lastContactedAt: cand.last_contacted_at,
  });
  if (!verdict.ok) {
    await audit(db, { orgId: a.orgId, candidateId: a.candidateId, eventType: "RECONNECT_REJECTED", actor: "SYSTEM", decision: "REJECTED", reason: verdict.reason, metadata: { proposed: a.at.toISOString(), by: a.label } });
    return { ok: false, reason: verdict.reason };
  }
  const { error } = await db.from("scheduled_actions").insert({
    org_id: a.orgId, candidate_id: a.candidateId, conversation_id: a.conversationId, campaign_id: null,
    action_type: "RECONNECT", payload: {}, scheduled_for: a.at.toISOString(), status: "PENDING", created_by_label: a.label,
  });
  if (error) return { ok: false, reason: error.message };
  await db.from("candidates").update({ communication_status: "NURTURE_SCHEDULED", next_contact_at: a.at.toISOString() }).eq("id", a.candidateId);
  await audit(db, { orgId: a.orgId, candidateId: a.candidateId, eventType: "RECONNECT_SCHEDULED", actor: a.actorUserId ? "USER" : "SYSTEM", actorUserId: a.actorUserId ?? null, decision: a.at.toISOString().slice(0, 10), reason: a.label });
  return { ok: true, at: a.at };
}
