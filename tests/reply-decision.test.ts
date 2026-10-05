import { describe, it, expect } from "vitest";
import { decideReply, validateDraft, proposedReconnect, type ClassificationLite, type ReplySettings } from "@/lib/policy/reply-decision";
import { costUsd } from "@/lib/ai/pricing";
import { isReservedDomain } from "@/lib/policy/eligibility";

const now = new Date("2026-09-24T12:00:00Z");
const settings: ReplySettings = {
  auto_threshold: 0.9, review_threshold: 0.75, approval_required: true,
  human_review_categories: ["COMPLAINT", "LEGAL_PRIVACY", "ANGRY", "COMP_NEGOTIATION", "UNCLEAR_IDENTITY"],
};
const base: ClassificationLite = { intent: "AVAILABLE_LATER", market_status: "OPEN_LATER", opt_out: false, reconnect_after: "2027-02-15", review_flags: [], needs_reply: true, confidence: 0.95 };

describe("decideReply", () => {
  it("opt-out wins over everything, whatever the confidence", () => {
    expect(decideReply({ ...base, opt_out: true, confidence: 0.1, review_flags: ["ANGRY"] }, settings, now).route).toBe("SUPPRESS");
    expect(decideReply({ ...base, intent: "OPT_OUT" }, settings, now).route).toBe("SUPPRESS");
  });
  it("out-of-office is ignored", () => {
    expect(decideReply({ ...base, intent: "OUT_OF_OFFICE" }, settings, now).route).toBe("IGNORE_AUTOMATED");
  });
  it("human-review flags route to a person", () => {
    const d = decideReply({ ...base, review_flags: ["LEGAL_PRIVACY"] }, settings, now);
    expect(d).toMatchObject({ route: "HUMAN_REVIEW", category: "LEGAL_PRIVACY", applyStatus: true });
  });
  it("flags the org has not selected do not force review", () => {
    expect(decideReply({ ...base, review_flags: ["OFFER_DISCUSSION"] }, settings, now).route).toBe("DRAFT");
  });
  it("unclear identity never updates the record", () => {
    expect(decideReply({ ...base, review_flags: ["UNCLEAR_IDENTITY"] }, settings, now)).toMatchObject({ route: "HUMAN_REVIEW", applyStatus: false });
    expect(decideReply({ ...base, intent: "WRONG_PERSON" }, settings, now)).toMatchObject({ route: "HUMAN_REVIEW", category: "UNCLEAR_IDENTITY", applyStatus: false });
  });
  it("low confidence goes to review without applying status", () => {
    expect(decideReply({ ...base, confidence: 0.6 }, settings, now)).toMatchObject({ route: "HUMAN_REVIEW", category: "LOW_CONFIDENCE", applyStatus: false });
  });
  it("approval mode drafts but never auto-sends", () => {
    expect(decideReply(base, settings, now)).toMatchObject({ route: "DRAFT", sendMode: "APPROVAL" });
  });
  it("auto-sends only with approval off and confidence at or above the auto threshold", () => {
    const off = { ...settings, approval_required: false };
    expect(decideReply(base, off, now)).toMatchObject({ route: "DRAFT", sendMode: "AUTO" });
    expect(decideReply({ ...base, confidence: 0.8 }, off, now)).toMatchObject({ route: "DRAFT", sendMode: "APPROVAL" });
  });
  it("no reply needed still keeps the reconnect", () => {
    const d = decideReply({ ...base, needs_reply: false }, settings, now);
    expect(d.route).toBe("NO_REPLY");
    expect(d.route === "NO_REPLY" && d.reconnectAt?.toISOString().slice(0, 10)).toBe("2027-02-15");
  });
});

describe("proposedReconnect", () => {
  it("rejects past, too-soon, too-far and invalid dates", () => {
    expect(proposedReconnect({ ...base, reconnect_after: "2026-09-01" }, now)).toBeNull();
    expect(proposedReconnect({ ...base, reconnect_after: "2026-09-24" }, now)).toBeNull();
    expect(proposedReconnect({ ...base, reconnect_after: "2030-01-01" }, now)).toBeNull();
    expect(proposedReconnect({ ...base, reconnect_after: "2027-13-45" }, now)).toBeNull();
  });
  it("never reconnects with people who said no", () => {
    expect(proposedReconnect({ ...base, intent: "NOT_INTERESTED" }, now)).toBeNull();
    expect(proposedReconnect({ ...base, market_status: "NOT_INTERESTED", intent: "OTHER" }, now)).toBeNull();
  });
});

describe("validateDraft", () => {
  const ok = "Hi Sam, thanks for getting back to me. That makes sense with the bonus timing. I will check back with you in early March to see where things stand.\n\nPriya\nANS RPO";
  it("passes a normal reply", () => expect(validateDraft(ok)).toEqual([]));
  it("catches links, placeholders, emails, money and AI mentions", () => {
    expect(validateDraft(`${ok} See https://x.com/jobs`)).toContain("contains a link");
    expect(validateDraft(`${ok} Hi [Name]`)).toContain("contains a placeholder");
    expect(validateDraft(`${ok} {{first_name}}`)).toContain("contains a placeholder");
    expect(validateDraft(`${ok} mail me at a@b.com`)).toContain("contains an email address");
    expect(validateDraft(`${ok} The role pays $180k.`)).toContain("mentions a money figure");
    expect(validateDraft(`${ok} As an AI I cannot`)).toContain("mentions AI");
    expect(validateDraft("Thanks!")).toContain("too short");
  });
});

describe("costUsd", () => {
  it("prices Luna with cached input discounted", () => {
    expect(costUsd("gpt-5.6-luna", { input: 1_000_000, cached: 0, output: 1_000_000 })).toBeCloseTo(1.4);
    expect(costUsd("gpt-5.6-luna", { input: 1_000_000, cached: 1_000_000, output: 0 })).toBeCloseTo(0.02);
  });
  it("costs unknown models at the higher rate", () => {
    expect(costUsd("mystery", { input: 1_000_000, cached: 0, output: 0 })).toBeCloseTo(2);
  });
});

describe("isReservedDomain", () => {
  it("blocks test domains only", () => {
    for (const e of ["a@example.com", "b@example.org", "c@foo.test", "d@x.invalid", "e@localhost", "f@mail.example"]) expect(isReservedDomain(e)).toBe(true);
    for (const e of ["a@gmail.com", "b@examples.com", "c@ansrpo.com", "d@testing.io"]) expect(isReservedDomain(e)).toBe(false);
  });
});

describe("sender warm-up and footer", async () => {
  const { effectiveSenderCaps, emailFooter } = await import("@/lib/policy/eligibility");
  const start = "2026-09-01T10:00:00Z";
  const sender = { status: "WARMING", daily_cap_new: 40, daily_cap_followup: 20, warmup_started_at: start };
  const at = (d: number) => new Date(new Date(start).getTime() + (d - 1) * 86400000 + 3600000);
  it("ramps a warming sender and never exceeds its configured cap", () => {
    expect(effectiveSenderCaps(sender, at(1))).toEqual({ newCap: 10, followupCap: 5, day: 1 });
    expect(effectiveSenderCaps(sender, at(5)).newCap).toBe(20);
    expect(effectiveSenderCaps(sender, at(10)).newCap).toBe(30);
    expect(effectiveSenderCaps(sender, at(30))).toEqual({ newCap: 40, followupCap: 20, day: 30 });
    expect(effectiveSenderCaps({ ...sender, daily_cap_new: 15 }, at(10)).newCap).toBe(15);
    expect(effectiveSenderCaps({ ...sender, status: "WARMED" }, at(1))).toEqual({ newCap: 40, followupCap: 20, day: null });
  });
  it("builds a footer with the opt-out link and address", () => {
    const f = emailFooter({ orgName: "ANS RPO", mailingAddress: "1 Main St, Dallas, TX", unsubscribeUrl: "https://x.test/u/abc" });
    expect(f).toContain("https://x.test/u/abc");
    expect(f).toContain("ANS RPO · 1 Main St, Dallas, TX");
    expect(emailFooter({ orgName: "ANS RPO", mailingAddress: null, unsubscribeUrl: "u" }).endsWith("ANS RPO")).toBe(true);
  });
});

describe("template merge", async () => {
  const { merge } = await import("@/lib/campaigns/templates");
  it("uses the sender's first name in the body", () => {
    expect(merge("I'm {{sender_name}} with {{org_name}}", { sender_name: "Vini · ANS RPO", org_name: "ANS RPO Solutions" })).toBe("I'm Vini with ANS RPO Solutions");
    expect(merge("{{sender_name}}", { sender_name: "Vini", org_name: "x" })).toBe("Vini");
  });
});
