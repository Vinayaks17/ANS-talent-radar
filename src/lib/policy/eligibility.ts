/**
 * Deterministic pre-send checks. The order matters and is the same everywhere:
 *   suppression → eligibility → limits → (only then) generate + send.
 * Every function is pure so it can be unit-tested without a database.
 */

export type CandidateLite = {
  communication_status: string;
  market_status: string;
  last_contacted_at: string | null;
  last_replied_at: string | null;
};

export type SettingsLite = {
  outreach_paused: boolean;
  min_gap_hours: number;
  max_unanswered_per_sequence: number;
};

export type Verdict = { ok: true } | { ok: false; reason: string; retryAt?: Date };

const LIVE = new Set(["CONVERSATION_ACTIVE", "HUMAN_REVIEW"]);

export function checkEligibility(args: {
  candidate: CandidateLite;
  settings: SettingsLite;
  campaignStatus: string | null;
  unansweredCount: number;
  isSuppressed: boolean;
  actionType: string;
  now: Date;
}): Verdict {
  const { candidate, settings, now } = args;

  if (args.isSuppressed || candidate.communication_status === "SUPPRESSED") return { ok: false, reason: "SUPPRESSED" };
  if (settings.outreach_paused) return { ok: false, reason: "OUTREACH_PAUSED", retryAt: new Date(now.getTime() + 15 * 60000) };
  if (args.campaignStatus && args.campaignStatus !== "ACTIVE") return { ok: false, reason: `CAMPAIGN_${args.campaignStatus}` };
  if (candidate.market_status === "NOT_INTERESTED") return { ok: false, reason: "NOT_INTERESTED" };

  // A live human conversation always wins over automation (replies excepted).
  if (args.actionType !== "SEND_REPLY" && LIVE.has(candidate.communication_status)) return { ok: false, reason: "LIVE_CONVERSATION" };

  // Sequence steps stop after N unanswered messages.
  if (["SEND_FOLLOW_UP", "SEND_FINAL"].includes(args.actionType) && args.unansweredCount >= settings.max_unanswered_per_sequence) {
    return { ok: false, reason: "MAX_UNANSWERED" };
  }

  // Minimum gap between any two touches to the same person.
  if (candidate.last_contacted_at && args.actionType !== "SEND_REPLY") {
    const gapMs = settings.min_gap_hours * 3600000;
    const since = now.getTime() - new Date(candidate.last_contacted_at).getTime();
    if (since < gapMs) return { ok: false, reason: "MIN_GAP", retryAt: new Date(now.getTime() + (gapMs - since)) };
  }

  return { ok: true };
}

export type LimitInput = {
  orgSentToday: number;
  orgCap: number;
  senderSentToday: number;
  senderCap: number;
  campaignSenderSentToday: number;
  campaignSenderCap: number;
};

export function checkLimits(l: LimitInput): Verdict {
  if (l.orgSentToday >= l.orgCap) return { ok: false, reason: "ORG_DAILY_CAP" };
  if (l.senderSentToday >= l.senderCap) return { ok: false, reason: "SENDER_DAILY_CAP" };
  if (l.campaignSenderSentToday >= l.campaignSenderCap) return { ok: false, reason: "CAMPAIGN_SENDER_CAP" };
  return { ok: true };
}

/**
 * AI recommends a reconnect date; this decides whether it becomes a scheduled action.
 * Mirrors section 14 of the concept document.
 */
export function validateNextContact(args: {
  proposed: Date;
  now: Date;
  followUpAllowed: boolean;
  isSuppressed: boolean;
  campaignActive: boolean;
  hasPendingSend: boolean;
  communicationStatus: string;
  minGapHours: number;
  lastContactedAt: string | null;
}): Verdict {
  if (args.isSuppressed) return { ok: false, reason: "SUPPRESSED" };
  if (!args.followUpAllowed) return { ok: false, reason: "FOLLOW_UP_NOT_ALLOWED" };
  if (!(args.proposed instanceof Date) || Number.isNaN(args.proposed.getTime())) return { ok: false, reason: "INVALID_DATE" };
  if (args.proposed <= args.now) return { ok: false, reason: "DATE_NOT_IN_FUTURE" };
  if (!args.campaignActive) return { ok: false, reason: "CAMPAIGN_INACTIVE" };
  if (args.hasPendingSend) return { ok: false, reason: "ALREADY_SCHEDULED" };
  if (LIVE.has(args.communicationStatus)) return { ok: false, reason: "LIVE_CONVERSATION" };
  if (args.lastContactedAt) {
    const earliest = new Date(args.lastContactedAt).getTime() + args.minGapHours * 3600000;
    if (args.proposed.getTime() < earliest) return { ok: false, reason: "MIN_GAP" };
  }
  return { ok: true };
}

/** RFC 2606 / 6761 test names. Never mailed: they only bounce and hurt sender reputation. */
export function isReservedDomain(email: string) {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return /^example\.(com|net|org)$/.test(d) || /(^|\.)(example|test|invalid|localhost)$/.test(d);
}

/**
 * Warm-up ramp for a new sending identity. A WARMING sender's daily caps grow
 * with its age so mailbox providers see a gradual start; configured caps
 * remain the ceiling. Day 1 is the day warm-up started.
 */
export const WARMUP_STEPS: { untilDay: number; newPerDay: number }[] = [
  { untilDay: 3, newPerDay: 10 },
  { untilDay: 7, newPerDay: 20 },
  { untilDay: 14, newPerDay: 30 },
  { untilDay: 21, newPerDay: 40 },
];

export function warmupDay(warmupStartedAt: string, now: Date) {
  return Math.max(1, Math.floor((now.getTime() - new Date(warmupStartedAt).getTime()) / 86400000) + 1);
}

export function effectiveSenderCaps(
  s: { status: string; daily_cap_new: number; daily_cap_followup: number; warmup_started_at: string },
  now: Date,
): { newCap: number; followupCap: number; day: number | null } {
  if (s.status !== "WARMING") return { newCap: s.daily_cap_new, followupCap: s.daily_cap_followup, day: null };
  const day = warmupDay(s.warmup_started_at, now);
  const step = WARMUP_STEPS.find((w) => day <= w.untilDay);
  if (!step) return { newCap: s.daily_cap_new, followupCap: s.daily_cap_followup, day };
  return { newCap: Math.min(s.daily_cap_new, step.newPerDay), followupCap: Math.min(s.daily_cap_followup, Math.ceil(step.newPerDay / 2)), day };
}

/** Plain-text footer for sequence and reconnect emails. Replies in a live conversation carry only the header. */
export function emailFooter(a: { orgName: string; mailingAddress: string | null; unsubscribeUrl: string }) {
  const lines = ["--", `Not interested? Reply "stop" or unsubscribe here: ${a.unsubscribeUrl}`];
  lines.push([a.orgName, a.mailingAddress?.trim()].filter(Boolean).join(" · "));
  return lines.join("\n");
}
