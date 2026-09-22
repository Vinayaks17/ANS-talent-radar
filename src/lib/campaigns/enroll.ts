import "server-only";
import type { Db } from "@/lib/db";
import { nextSendSlot, isValidTimeZone, jitter } from "@/lib/policy/send-window";
import { audit } from "@/lib/audit";

export type EnrollFilters = {
  marketStatuses?: string[];
  industry?: string | null;
  locationContains?: string | null;
  limit: number;
};

/**
 * Candidates a campaign may enrol. Deterministic rules:
 *  - not suppressed, not NOT_INTERESTED
 *  - not currently enrolled in any campaign
 *  - never contacted, or last contacted more than recontact_days ago
 *  - no live conversation / human review
 */
export async function findEligible(db: Db, orgId: string, campaign: { id: string; recontact_days: number }, f: EnrollFilters) {
  const cutoff = new Date(Date.now() - campaign.recontact_days * 86400000).toISOString();

  const { data: enrolledRows } = await db.from("campaign_enrollments").select("candidate_id").eq("org_id", orgId).eq("status", "ENROLLED");
  const enrolled = new Set((enrolledRows ?? []).map((r) => r.candidate_id));

  let q = db
    .from("candidates")
    .select("id, email_normalized, timezone, last_contacted_at, communication_status, market_status, industry, location")
    .eq("org_id", orgId)
    .in("communication_status", ["NOT_CONTACTED", "CLOSED", "NURTURE_SCHEDULED"])
    .neq("market_status", "NOT_INTERESTED")
    .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`)
    .order("created_at")
    .limit(Math.min(f.limit + enrolled.size, 20000));

  if (f.marketStatuses && f.marketStatuses.length) q = q.in("market_status", f.marketStatuses as never);
  if (f.industry) q = q.ilike("industry", `%${f.industry}%`);
  if (f.locationContains) q = q.ilike("location", `%${f.locationContains}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Suppression is the final gate, checked against the list itself (not just status).
  const emails = (data ?? []).map((c) => c.email_normalized);
  const suppressed = new Set<string>();
  for (let i = 0; i < emails.length; i += 500) {
    const { data: s } = await db.from("suppressions").select("identifier").eq("org_id", orgId).eq("channel", "email").in("identifier", emails.slice(i, i + 500));
    for (const r of s ?? []) suppressed.add(r.identifier);
  }

  return (data ?? []).filter((c) => !enrolled.has(c.id) && !suppressed.has(c.email_normalized)).slice(0, f.limit);
}

export async function enroll(
  db: Db,
  args: {
    orgId: string;
    userId: string;
    campaign: { id: string; recontact_days: number; daily_sender_limit: number; sender_ids: string[]; send_days: number[] | null; send_window_start: string | null; send_window_end: string | null };
    settings: { send_days: number[]; send_window_start: string; send_window_end: string; default_timezone: string; max_new_per_sender_per_day: number };
    senders: { id: string; daily_cap_new: number }[];
    filters: EnrollFilters;
  },
) {
  const { orgId, campaign, settings } = args;
  const candidates = await findEligible(db, orgId, campaign, args.filters);
  if (candidates.length === 0) return { enrolled: 0, scheduled: 0 };

  // Daily capacity across this campaign's senders decides how the pool is spread.
  const active = args.senders.filter((s) => campaign.sender_ids.includes(s.id));
  const perSender = Math.min(campaign.daily_sender_limit, settings.max_new_per_sender_per_day);
  const dailyCapacity = Math.max(1, active.reduce((sum, s) => sum + Math.min(perSender, s.daily_cap_new), 0));

  const window = {
    days: campaign.send_days ?? settings.send_days,
    start: (campaign.send_window_start ?? settings.send_window_start).slice(0, 5),
    end: (campaign.send_window_end ?? settings.send_window_end).slice(0, 5),
  };
  const now = new Date();

  const enrollments = candidates.map((c) => ({ org_id: orgId, campaign_id: campaign.id, candidate_id: c.id, status: "ENROLLED" as const, current_step: 0 }));
  const { error: eErr } = await db.from("campaign_enrollments").insert(enrollments);
  if (eErr) throw new Error(`enroll failed: ${eErr.message}`);

  const actions = candidates.map((c, i) => {
    const dayOffset = Math.floor(i / dailyCapacity);
    const tz = isValidTimeZone(c.timezone) ? c.timezone : settings.default_timezone;
    let at = nextSendSlot(new Date(now.getTime() + dayOffset * 86400000), tz, window);
    at = jitter(at, 300, i * 7919); // spread across up to 5 hours of the window
    return {
      org_id: orgId, candidate_id: c.id, campaign_id: campaign.id, action_type: "SEND_INITIAL" as const,
      payload: { step_number: 1 }, scheduled_for: at.toISOString(), status: "PENDING" as const, created_by_label: "enroll",
    };
  });
  for (let i = 0; i < actions.length; i += 500) {
    const { error } = await db.from("scheduled_actions").insert(actions.slice(i, i + 500));
    if (error) throw new Error(`schedule failed: ${error.message}`);
  }
  await db.from("candidates").update({ communication_status: "SEQUENCE_ACTIVE" }).in("id", candidates.map((c) => c.id));

  await audit(db, {
    orgId, eventType: "CAMPAIGN_ENROLLED", actor: "USER", actorUserId: args.userId,
    decision: `${candidates.length} candidates`, reason: `daily capacity ${dailyCapacity}`, metadata: { campaign_id: campaign.id, filters: args.filters },
  });
  return { enrolled: candidates.length, scheduled: actions.length, dailyCapacity };
}
