/**
 * What happens after the AI has read a reply. The model only recommends
 * (classification); this pure function decides. Order of precedence:
 *   opt-out → automated → human-review flags → confidence → reply / no reply.
 */

export type ClassificationLite = {
  intent: string;
  market_status: string;
  opt_out: boolean;
  reconnect_after: string | null;
  review_flags: string[];
  needs_reply: boolean;
  confidence: number;
};

export type ReplySettings = {
  auto_threshold: number;
  review_threshold: number;
  approval_required: boolean;
  human_review_categories: string[];
};

export type ReplyDecision =
  | { route: "SUPPRESS"; reason: string }
  | { route: "IGNORE_AUTOMATED"; reason: string }
  | { route: "HUMAN_REVIEW"; category: string; reason: string; reconnectAt: Date | null; applyStatus: boolean }
  | { route: "DRAFT"; sendMode: "APPROVAL" | "AUTO"; reason: string; reconnectAt: Date | null; applyStatus: boolean }
  | { route: "NO_REPLY"; reason: string; reconnectAt: Date | null; applyStatus: boolean };

const NO_RECONNECT = new Set(["NOT_INTERESTED", "OPT_OUT", "WRONG_PERSON"]);
const MAX_AHEAD_MS = 2 * 365 * 86400000;

/** A model-proposed reconnect date, if it is sane. Final check happens in validateNextContact at scheduling time. */
export function proposedReconnect(c: Pick<ClassificationLite, "reconnect_after" | "intent" | "market_status">, now: Date): Date | null {
  if (!c.reconnect_after || NO_RECONNECT.has(c.intent) || c.market_status === "NOT_INTERESTED") return null;
  const d = new Date(`${c.reconnect_after}T14:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime() + 86400000 || d.getTime() > now.getTime() + MAX_AHEAD_MS) return null;
  return d;
}

export function decideReply(c: ClassificationLite, s: ReplySettings, now: Date): ReplyDecision {
  if (c.opt_out || c.intent === "OPT_OUT") return { route: "SUPPRESS", reason: "AI detected an opt-out request" };
  if (c.intent === "OUT_OF_OFFICE") return { route: "IGNORE_AUTOMATED", reason: "out-of-office" };

  const reconnectAt = proposedReconnect(c, now);
  const confident = c.confidence >= s.review_threshold;

  const flagged = c.review_flags.filter((f) => s.human_review_categories.includes(f));
  if (flagged.length) return { route: "HUMAN_REVIEW", category: flagged[0], reason: `flagged: ${flagged.join(", ")}`, reconnectAt, applyStatus: confident && !flagged.includes("UNCLEAR_IDENTITY") };
  if (c.intent === "WRONG_PERSON") return { route: "HUMAN_REVIEW", category: "UNCLEAR_IDENTITY", reason: "candidate says we have the wrong person", reconnectAt: null, applyStatus: false };
  if (!confident) return { route: "HUMAN_REVIEW", category: "LOW_CONFIDENCE", reason: `confidence ${c.confidence.toFixed(2)} < ${s.review_threshold}`, reconnectAt, applyStatus: false };

  if (c.needs_reply) {
    const auto = !s.approval_required && c.confidence >= s.auto_threshold;
    return { route: "DRAFT", sendMode: auto ? "AUTO" : "APPROVAL", reason: auto ? `confidence ${c.confidence.toFixed(2)} ≥ auto threshold` : s.approval_required ? "approval mode" : `confidence ${c.confidence.toFixed(2)} < auto threshold`, reconnectAt, applyStatus: true };
  }
  return { route: "NO_REPLY", reason: "no reply needed", reconnectAt, applyStatus: true };
}

/**
 * Hard checks on any AI-written email before it can go out or be offered as a
 * draft. A failed check never blocks a human; it forces approval.
 */
export function validateDraft(text: string, opts: { minWords?: number; maxWords?: number } = {}): string[] {
  const problems: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < (opts.minWords ?? 12)) problems.push("too short");
  if (words > (opts.maxWords ?? 220)) problems.push("too long");
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|io|net|org|co)\/\S*/i.test(text)) problems.push("contains a link");
  if (/\[[^\]]{1,40}\]|\{\{?\s*[a-z_ ]+\s*\}?\}/i.test(text)) problems.push("contains a placeholder");
  if (/\b(as an ai|language model|chatgpt|openai)\b/i.test(text)) problems.push("mentions AI");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) problems.push("contains an email address");
  if (/[$€£₹]\s?\d/.test(text)) problems.push("mentions a money figure");
  return problems;
}
