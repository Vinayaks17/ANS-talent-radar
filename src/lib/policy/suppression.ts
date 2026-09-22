import "server-only";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";

export type SuppressReason = "OPT_OUT" | "COMPLAINT" | "BOUNCE" | "MANUAL" | "LEGAL";

export async function isSuppressed(db: Db, orgId: string, emailNormalized: string) {
  const { data } = await db.from("suppressions").select("id").eq("org_id", orgId).eq("channel", "email").eq("identifier", emailNormalized).maybeSingle();
  return !!data;
}

/**
 * The single write path to the suppression list. Callers are humans (server
 * actions, with the user's client) or the bounce/complaint webhook and the
 * rule-based opt-out detector (service role). The AI never calls this.
 */
export async function suppress(
  db: Db,
  args: { orgId: string; emailNormalized: string; candidateId?: string | null; reason: SuppressReason; note?: string; byUserId?: string | null; byLabel: string },
) {
  const { error } = await db.from("suppressions").upsert(
    {
      org_id: args.orgId, channel: "email", identifier: args.emailNormalized, candidate_id: args.candidateId ?? null,
      reason: args.reason, note: args.note ?? null, created_by: args.byUserId ?? null, created_by_label: args.byLabel,
    },
    { onConflict: "org_id,channel,identifier", ignoreDuplicates: true },
  );
  if (error) throw new Error(`suppress failed: ${error.message}`);

  let candidateId = args.candidateId ?? null;
  if (!candidateId) {
    const { data } = await db.from("candidates").select("id").eq("org_id", args.orgId).eq("email_normalized", args.emailNormalized).maybeSingle();
    candidateId = data?.id ?? null;
  }
  if (candidateId) {
    await Promise.all([
      db.from("candidates").update({
        communication_status: "SUPPRESSED",
        market_status: args.reason === "OPT_OUT" || args.reason === "COMPLAINT" ? "NOT_INTERESTED" : undefined,
        next_contact_at: null,
      }).eq("id", candidateId),
      db.from("scheduled_actions").update({ status: "CANCELLED", last_error: `suppressed:${args.reason}` })
        .eq("candidate_id", candidateId).in("status", ["PENDING", "PROCESSING"]),
      db.from("campaign_enrollments").update({ status: "SUPPRESSED" }).eq("candidate_id", candidateId).eq("status", "ENROLLED"),
      db.from("review_items").update({ status: "SUPPRESSED" }).eq("candidate_id", candidateId).eq("status", "OPEN"),
    ]);
  }
  await audit(db, {
    orgId: args.orgId, candidateId, eventType: "CANDIDATE_SUPPRESSED",
    actor: args.byUserId ? "USER" : "SYSTEM", actorUserId: args.byUserId ?? null,
    decision: args.reason, reason: args.note ?? args.byLabel,
  });
  return candidateId;
}
