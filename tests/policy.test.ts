import { describe, it, expect } from "vitest";
import { checkEligibility, checkLimits, validateNextContact } from "@/lib/policy/eligibility";
import { detectOptOut, replyOnly } from "@/lib/policy/opt-out";
import { nextSendSlot, partsIn, zonedToUtc } from "@/lib/policy/send-window";

const now = new Date("2026-09-22T12:00:00Z");
const settings = { outreach_paused: false, min_gap_hours: 72, max_unanswered_per_sequence: 3 };
const cand = { communication_status: "WAITING_FOR_REPLY", market_status: "UNKNOWN", last_contacted_at: null, last_replied_at: null };

describe("checkEligibility", () => {
  const base = { candidate: cand, settings, campaignStatus: "ACTIVE", unansweredCount: 1, isSuppressed: false, actionType: "SEND_FOLLOW_UP", now };
  it("passes a normal follow-up", () => expect(checkEligibility(base)).toEqual({ ok: true }));
  it("blocks suppressed before anything else", () => {
    expect(checkEligibility({ ...base, isSuppressed: true, settings: { ...settings, outreach_paused: true } })).toMatchObject({ ok: false, reason: "SUPPRESSED" });
  });
  it("defers when outreach is paused", () => expect(checkEligibility({ ...base, settings: { ...settings, outreach_paused: true } })).toMatchObject({ ok: false, reason: "OUTREACH_PAUSED" }));
  it("blocks paused campaigns", () => expect(checkEligibility({ ...base, campaignStatus: "PAUSED" })).toMatchObject({ ok: false, reason: "CAMPAIGN_PAUSED" }));
  it("never automates over a live conversation", () => {
    expect(checkEligibility({ ...base, candidate: { ...cand, communication_status: "HUMAN_REVIEW" } })).toMatchObject({ ok: false, reason: "LIVE_CONVERSATION" });
    expect(checkEligibility({ ...base, candidate: { ...cand, communication_status: "HUMAN_REVIEW" }, actionType: "SEND_REPLY" })).toEqual({ ok: true });
  });
  it("stops after max unanswered", () => expect(checkEligibility({ ...base, unansweredCount: 3 })).toMatchObject({ ok: false, reason: "MAX_UNANSWERED" }));
  it("enforces the minimum gap with a retry time", () => {
    const r = checkEligibility({ ...base, candidate: { ...cand, last_contacted_at: "2026-09-21T12:00:00Z" } });
    expect(r).toMatchObject({ ok: false, reason: "MIN_GAP" });
    if (!r.ok) expect(r.retryAt?.toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });
});

describe("checkLimits", () => {
  it("respects caps in order", () => {
    expect(checkLimits({ orgSentToday: 160, orgCap: 160, senderSentToday: 0, senderCap: 40, campaignSenderSentToday: 0, campaignSenderCap: 40 })).toMatchObject({ reason: "ORG_DAILY_CAP" });
    expect(checkLimits({ orgSentToday: 10, orgCap: 160, senderSentToday: 40, senderCap: 40, campaignSenderSentToday: 0, campaignSenderCap: 40 })).toMatchObject({ reason: "SENDER_DAILY_CAP" });
    expect(checkLimits({ orgSentToday: 10, orgCap: 160, senderSentToday: 5, senderCap: 40, campaignSenderSentToday: 20, campaignSenderCap: 20 })).toMatchObject({ reason: "CAMPAIGN_SENDER_CAP" });
    expect(checkLimits({ orgSentToday: 10, orgCap: 160, senderSentToday: 5, senderCap: 40, campaignSenderSentToday: 5, campaignSenderCap: 20 })).toEqual({ ok: true });
  });
});

describe("validateNextContact", () => {
  const base = { proposed: new Date("2027-03-01T14:00:00Z"), now, followUpAllowed: true, isSuppressed: false, campaignActive: true, hasPendingSend: false, communicationStatus: "NURTURE_SCHEDULED", minGapHours: 72, lastContactedAt: "2026-09-17T00:00:00Z" };
  it("accepts an explicit future reconnect", () => expect(validateNextContact(base)).toEqual({ ok: true }));
  it("rejects past dates, no permission, existing schedule", () => {
    expect(validateNextContact({ ...base, proposed: new Date("2026-01-01") })).toMatchObject({ reason: "DATE_NOT_IN_FUTURE" });
    expect(validateNextContact({ ...base, followUpAllowed: false })).toMatchObject({ reason: "FOLLOW_UP_NOT_ALLOWED" });
    expect(validateNextContact({ ...base, hasPendingSend: true })).toMatchObject({ reason: "ALREADY_SCHEDULED" });
  });
});

describe("opt-out rules", () => {
  it("detects obvious phrases", () => {
    expect(detectOptOut("Please remove me from your list.").optOut).toBe(true);
    expect(detectOptOut("UNSUBSCRIBE").optOut).toBe(true);
    expect(detectOptOut("Don’t contact me again").optOut).toBe(true);
  });
  it("ignores quoted history", () => {
    const t = "Sounds good, talk in March.\n\nOn Tue, Sep 16, Sushant wrote:\n> reply STOP or unsubscribe at any time";
    expect(detectOptOut(t).optOut).toBe(false);
    expect(replyOnly(t).trim()).toBe("Sounds good, talk in March.");
  });
  it("does not trigger on normal replies", () => {
    expect(detectOptOut("Not right now, maybe after my bonus in Feb.").optOut).toBe(false);
  });
});

describe("send window", () => {
  const w = { days: [2, 3, 4], start: "09:00", end: "16:00" };
  it("keeps an in-window instant", () => {
    const t = new Date("2026-09-22T15:00:00Z"); // Tue 10:00 Chicago (CDT, UTC-5)
    expect(nextSendSlot(t, "America/Chicago", w).toISOString()).toBe(t.toISOString());
  });
  it("moves a Friday to next Tuesday 09:00 local", () => {
    const t = new Date("2026-09-25T15:00:00Z"); // Fri
    const r = nextSendSlot(t, "America/Chicago", w);
    const p = partsIn(r, "America/Chicago");
    expect([p.weekday, p.hour, p.minute]).toEqual([2, 9, 0]);
  });
  it("moves after-hours to the next allowed morning", () => {
    const t = new Date("2026-09-22T23:30:00Z"); // Tue 18:30 Chicago
    const p = partsIn(nextSendSlot(t, "America/Chicago", w), "America/Chicago");
    expect([p.weekday, p.hour]).toEqual([3, 9]);
  });
  it("zonedToUtc handles DST", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc(2026, 1, 15, 9, 0, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
});
