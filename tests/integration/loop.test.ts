/**
 * End-to-end loop against the dev database with email sending stubbed.
 * Run: RUN_INTEGRATION=1 npx vitest run tests/integration
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(async (m: { to: string; subject: string }) => ({ id: `stub_${m.to}_${Date.now()}` })),
  getReceivedEmail: vi.fn(),
  extractAddress: (v: string) => { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim().toLowerCase(); },
}));

const run = process.env.RUN_INTEGRATION === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SECRET_KEY!;
const db = createClient<Database>(url, key, { auth: { persistSession: false } });
const tag = `e2e${Date.now().toString(36)}`;
const ids: { org?: string; sender?: string; campaign?: string; candidates: string[] } = { candidates: [] };

describe.skipIf(!run)("outreach loop (dry run)", () => {
  beforeAll(async () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.CRON_SECRET = "x".repeat(20);
    const { data: org } = await db.from("orgs").select("id").eq("slug", "ans").single();
    ids.org = org!.id;
    // Wide-open window so the dispatcher does not defer during the test
    await db.from("org_settings").update({ send_days: [1, 2, 3, 4, 5, 6, 7], send_window_start: "00:00", send_window_end: "23:59", outreach_paused: false }).eq("org_id", ids.org);
    const { data: sender } = await db.from("senders").insert({ org_id: ids.org, email: `${tag}@talent.example.com`, display_name: "Test Sender", status: "WARMED", daily_cap_new: 40, daily_cap_followup: 20 }).select("id").single();
    ids.sender = sender!.id;
    const { data: camp } = await db.from("campaigns").insert({ org_id: ids.org, name: `E2E ${tag}`, status: "ACTIVE", sector: "freight", sender_ids: [ids.sender], recontact_days: 90, daily_sender_limit: 40 }).select("id").single();
    ids.campaign = camp!.id;
    const { DEFAULT_STEPS } = await import("@/lib/campaigns/templates");
    await db.from("campaign_steps").insert(DEFAULT_STEPS.map((s) => ({ ...s, org_id: ids.org!, campaign_id: ids.campaign! })));
    const emails = [1, 2, 3].map((n) => `${tag}+${n}@example.com`);
    const { data: cands } = await db.from("candidates").insert(emails.map((e, i) => ({ org_id: ids.org!, email: e, email_normalized: e, first_name: `Cand${i + 1}`, last_name: tag, industry: "freight", location: "Dallas, TX", timezone: "America/Chicago" }))).select("id, email_normalized");
    ids.candidates = cands!.map((c) => c.id);
    await db.from("suppressions").insert({ org_id: ids.org, channel: "email", identifier: emails[2], reason: "MANUAL", created_by_label: "test" });
  });

  afterAll(async () => {
    if (!ids.org) return;
    if (ids.candidates.length) await db.from("candidates").delete().in("id", ids.candidates);
    if (ids.campaign) await db.from("campaigns").delete().eq("id", ids.campaign);
    if (ids.sender) await db.from("senders").delete().eq("id", ids.sender);
    await db.from("suppressions").delete().eq("org_id", ids.org).like("identifier", `${tag}%`);
    await db.from("inbound_events").delete().like("provider_event_id", `${tag}%`);
    await db.from("audit_events").delete().eq("org_id", ids.org).gte("created_at", new Date(Date.now() - 600000).toISOString()).is("candidate_id", null);
    await db.from("org_settings").update({ send_days: [2, 3, 4], send_window_start: "09:00", send_window_end: "16:00" }).eq("org_id", ids.org);
  });

  it("enrols only eligible candidates and schedules initial sends", async () => {
    const { enroll } = await import("@/lib/campaigns/enroll");
    const { data: settings } = await db.from("org_settings").select("send_days, send_window_start, send_window_end, default_timezone, max_new_per_sender_per_day").eq("org_id", ids.org!).single();
    const { data: campaign } = await db.from("campaigns").select("id, recontact_days, daily_sender_limit, sender_ids, send_days, send_window_start, send_window_end").eq("id", ids.campaign!).single();
    const r = await enroll(db, { orgId: ids.org!, userId: ids.org!, campaign: campaign!, settings: settings!, senders: [{ id: ids.sender!, daily_cap_new: 40 }], filters: { limit: 100, industry: "freight", locationContains: null, marketStatuses: [] } });
    expect(r.enrolled).toBe(2); // the suppressed one is excluded
    const { data: acts } = await db.from("scheduled_actions").select("id, action_type").in("candidate_id", ids.candidates).eq("status", "PENDING");
    expect(acts!.filter((a) => a.action_type === "SEND_INITIAL")).toHaveLength(2);
  });

  it("dispatches initial emails and schedules follow-ups", async () => {
    await db.from("scheduled_actions").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).in("candidate_id", ids.candidates).eq("status", "PENDING");
    const { runDispatcher } = await import("@/lib/workers/dispatcher");
    const s = await runDispatcher(db, { limit: 50, workerId: tag });
    const mine = s.details.filter((d) => ids.candidates.some((c) => d.includes(c.slice(0, 8))));
    expect(mine.filter((d) => d.includes("→ sent"))).toHaveLength(2);
    const { data: msgs } = await db.from("messages").select("direction, message_type, to_address").in("candidate_id", ids.candidates);
    expect(msgs!.filter((m) => m.message_type === "INITIAL")).toHaveLength(2);
    const { data: next } = await db.from("scheduled_actions").select("action_type, payload").in("candidate_id", ids.candidates).eq("status", "PENDING");
    expect(next!.map((n) => n.action_type)).toEqual(["SEND_FOLLOW_UP", "SEND_FOLLOW_UP"]);
    const { data: c } = await db.from("candidates").select("communication_status").eq("id", ids.candidates[0]).single();
    expect(c!.communication_status).toBe("WAITING_FOR_REPLY");
  });

  it("routes a real reply to the review queue and cancels the sequence", async () => {
    const { getReceivedEmail } = await import("@/lib/email/resend");
    const { data: conv } = await db.from("conversations").select("thread_token").eq("candidate_id", ids.candidates[0]).single();
    (getReceivedEmail as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      id: `${tag}-recv-1`, from: `Cand1 <${tag}+1@example.com>`, to: [`${tag}+t_${conv!.thread_token}@talent.example.com`], subject: "Re: Quick question, Cand1",
      text: "Thanks — not right now, bonus pays in Feb. Happy to talk in March.\n\nOn Tue, Sep 22, 2026 Test Sender wrote:\n> Hi Cand1", html: null, headers: {}, message_id: "<abc@example.com>", created_at: new Date().toISOString(), attachments: [],
    });
    await db.from("inbound_events").insert({ provider: "resend", provider_event_id: `${tag}-ev-1`, event_type: "email.received", payload: { type: "email.received", data: { email_id: `${tag}-recv-1` } } });
    const { processInboundEvents } = await import("@/lib/workers/inbound");
    const out = await processInboundEvents(db, 20);
    expect(out.some((o) => o.includes("review queue"))).toBe(true);
    const { data: item } = await db.from("review_items").select("category").eq("candidate_id", ids.candidates[0]).eq("status", "OPEN").single();
    expect(item!.category).toBe("REPLY_RECEIVED");
    const { data: msg } = await db.from("messages").select("reply_text").eq("candidate_id", ids.candidates[0]).eq("direction", "INBOUND").single();
    expect(msg!.reply_text).toBe("Thanks — not right now, bonus pays in Feb. Happy to talk in March.");
    const { data: pending } = await db.from("scheduled_actions").select("id").eq("candidate_id", ids.candidates[0]).eq("status", "PENDING");
    expect(pending).toHaveLength(0);
  });

  it("suppresses immediately on an opt-out reply", async () => {
    const { getReceivedEmail } = await import("@/lib/email/resend");
    const { data: conv } = await db.from("conversations").select("thread_token").eq("candidate_id", ids.candidates[1]).single();
    (getReceivedEmail as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      id: `${tag}-recv-2`, from: `${tag}+2@example.com`, to: [`${tag}+t_${conv!.thread_token}@talent.example.com`], subject: "Re: Quick question", text: "Please remove me from your list.", html: null, headers: {}, message_id: "<def@example.com>", created_at: new Date().toISOString(), attachments: [],
    });
    await db.from("inbound_events").insert({ provider: "resend", provider_event_id: `${tag}-ev-2`, event_type: "email.received", payload: { type: "email.received", data: { email_id: `${tag}-recv-2` } } });
    const { processInboundEvents } = await import("@/lib/workers/inbound");
    await processInboundEvents(db, 20);
    const { data: sup } = await db.from("suppressions").select("reason").eq("identifier", `${tag}+2@example.com`).single();
    expect(sup!.reason).toBe("OPT_OUT");
    const { data: c } = await db.from("candidates").select("communication_status, market_status").eq("id", ids.candidates[1]).single();
    expect(c!.communication_status).toBe("SUPPRESSED");
    expect(c!.market_status).toBe("NOT_INTERESTED");
  });

  it("never sends to a suppressed candidate even if an action exists", async () => {
    await db.from("scheduled_actions").insert({ org_id: ids.org!, candidate_id: ids.candidates[1], campaign_id: ids.campaign!, action_type: "SEND_FOLLOW_UP", payload: { step_number: 2 }, scheduled_for: new Date(Date.now() - 1000).toISOString(), status: "PENDING" });
    const { runDispatcher } = await import("@/lib/workers/dispatcher");
    const s = await runDispatcher(db, { limit: 50, workerId: tag });
    expect(s.details.some((d) => d.includes(ids.candidates[1].slice(0, 8)) && d.includes("SUPPRESSED"))).toBe(true);
  });
});
