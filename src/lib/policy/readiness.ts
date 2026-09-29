/**
 * Market Readiness Score (0-100): how likely a candidate is to move soon,
 * from what they have told us and how recently. Pure and explainable — every
 * point comes with a reason a recruiter can read. Role fit is scored
 * separately (AI); the match combines the two.
 */

export type ReadinessInput = {
  market_status: string;
  communication_status: string;
  availability_date: string | null;
  last_verified_at: string | null;
  last_replied_at: string | null;
};

export type Readiness = { score: number; band: "HOT" | "WARM" | "COOL" | "COLD"; reasons: string[] };

const DAY = 86400000;

const BASE: Record<string, [number, string]> = {
  AVAILABLE_NOW: [90, "available now"],
  OPEN_TO_RIGHT_OPPORTUNITY: [65, "open to the right role"],
  PASSIVE: [35, "passive"],
  NOT_LOOKING: [15, "not looking"],
  NOT_INTERESTED: [0, "not interested"],
  UNKNOWN: [20, "status unknown"],
};

function openLater(availability: string | null, now: Date): [number, string] {
  if (!availability) return [40, "open later, no date given"];
  const days = Math.round((new Date(`${availability.slice(0, 10)}T00:00:00Z`).getTime() - now.getTime()) / DAY);
  if (days <= 30) return [80, days <= 0 ? "said they'd be open by now" : "open within a month"];
  if (days <= 90) return [65, "open within 3 months"];
  if (days <= 180) return [45, "open within 6 months"];
  return [30, "open in 6+ months"];
}

export function readinessScore(c: ReadinessInput, now: Date = new Date()): Readiness {
  if (c.communication_status === "SUPPRESSED") return { score: 0, band: "COLD", reasons: ["opted out / suppressed — not contactable"] };

  const [base, why] = c.market_status === "OPEN_LATER" ? openLater(c.availability_date, now) : (BASE[c.market_status] ?? BASE.UNKNOWN);
  const reasons = [why];
  let score = base;

  // Stale information counts for less. Unknown status is already low, so it is not decayed further.
  if (c.market_status !== "UNKNOWN") {
    const age = c.last_verified_at ? (now.getTime() - new Date(c.last_verified_at).getTime()) / DAY : Infinity;
    const [factor, label] = age <= 30 ? [1, null] : age <= 90 ? [0.9, "confirmed 1–3 months ago"] : age <= 180 ? [0.75, "confirmed 3–6 months ago"] : [0.6, c.last_verified_at ? "confirmed over 6 months ago" : "never confirmed by the candidate"];
    score *= factor;
    if (label) reasons.push(label);
  }

  // Engagement: a recent reply or a live conversation is a strong signal.
  if (c.last_replied_at && now.getTime() - new Date(c.last_replied_at).getTime() <= 30 * DAY && c.market_status !== "NOT_INTERESTED") {
    score += 5;
    reasons.push("replied in the last 30 days");
  }
  if (["CONVERSATION_ACTIVE", "HUMAN_REVIEW"].includes(c.communication_status) && c.market_status !== "NOT_INTERESTED") {
    score += 5;
    reasons.push("in an active conversation");
  }

  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { score: s, band: s >= 75 ? "HOT" : s >= 50 ? "WARM" : s >= 25 ? "COOL" : "COLD", reasons };
}

/**
 * Role Fit × Market Readiness. Readiness scales the fit between half and
 * full strength, so a perfect-fit candidate who isn't moving still ranks, but
 * below an equally good one who is.
 */
export function combinedMatchScore(roleFit: number, readiness: number) {
  const fit = Math.max(0, Math.min(100, roleFit));
  const ready = Math.max(0, Math.min(100, readiness));
  return Math.round(fit * (0.5 + ready / 200));
}

/** Search terms for the full-text prefilter, from the structured requirement fields. */
export function requirementTerms(r: { title: string; must_have: string[]; nice_to_have: string[] }) {
  const STOP = new Set(["and", "or", "the", "a", "an", "of", "for", "with", "in", "to", "senior", "junior", "lead", "manager", "specialist", "years", "year", "experience", "strong", "knowledge"]);
  const words = [r.title, ...r.must_have, ...r.nice_to_have].join(" ").toLowerCase().split(/[^a-z0-9+#.]+/);
  return [...new Set(words.filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)))].slice(0, 30);
}
