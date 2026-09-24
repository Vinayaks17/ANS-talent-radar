/**
 * Runs every case in cases.ts through the live classifier (the active prompt in
 * the database) and decideReply(). Run before shipping any prompt change:
 *   RUN_AI_EVAL=1 npx vitest run tests/replies     (needs .env.local exported)
 * Pass bar: zero missed opt-outs, zero false opt-outs, ≥ 90% of cases fully right.
 * Cost: ~35 Luna calls ≈ $0.03.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CASES, type ReplyCase } from "./cases";

const run = process.env.RUN_AI_EVAL === "1";

describe.skipIf(!run)("reply suite (live classifier)", () => {
  it("meets the pass bar", async () => {
    process.env.CRON_SECRET ??= "x".repeat(20); // env() validates the full server env
    const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { classifyReply } = await import("@/lib/ai/tasks");
    const { decideReply } = await import("@/lib/policy/reply-decision");
    const { data: org } = await db.from("orgs").select("id").eq("slug", "ans").single();
    const { data: settings } = await db.from("org_settings").select("*").eq("org_id", org!.id).single();
    const s = { ...settings!, approval_required: true, auto_threshold: Number(settings!.auto_threshold), review_threshold: Number(settings!.review_threshold) };
    const now = new Date("2026-09-24T12:00:00Z");
    const candidate = {
      id: null as unknown as string, org_id: org!.id, first_name: "Sam", last_name: "Rivera", current_title: "Operations Manager", current_company: "Acme Freight",
      location: "Dallas, TX", market_status: "UNKNOWN", availability_date: null, availability_precision: "UNKNOWN", preferred_roles: [], preferred_locations: [],
      remote_preference: null, notice_period: null, skills: [], industry: "logistics", memory_summary: null,
    } as unknown as Database["public"]["Tables"]["candidates"]["Row"];
    const thread = [{ direction: "OUTBOUND" as const, subject: "Quick question, Sam", at: "2026-09-20T15:00:00Z", text: "Hi Sam,\n\nI'm Priya with ANS RPO — we work with firms in logistics. Are you open to opportunities right now? If not, is there a better time for me to check back?\n\nPriya" }];

    const results: { c: ReplyCase; problems: string[] }[] = [];
    const queue = [...CASES];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const problems: string[] = [];
        try {
          const r = await classifyReply(db, { settings: s, candidate, thread, reply: c.reply });
          const out = r.data;
          const d = decideReply(out, s, now);
          if (!c.intent.includes(out.intent)) problems.push(`intent ${out.intent}`);
          if (c.market && !c.market.includes(out.market_status)) problems.push(`market ${out.market_status}`);
          if (c.optOut !== undefined && out.opt_out !== c.optOut) problems.push(`opt_out ${out.opt_out}`);
          for (const f of c.flags ?? []) if (!out.review_flags.includes(f as never)) problems.push(`missing flag ${f}`);
          if (!c.route.includes(d.route)) problems.push(`route ${d.route}`);
          if (c.availabilityMonth && !c.availabilityMonth.includes(out.availability?.date.slice(0, 7) ?? "")) problems.push(`availability ${out.availability?.date ?? "null"}`);
          if (c.reconnect === true && !out.reconnect_after) problems.push("no reconnect");
          if (c.reconnect === false && "reconnectAt" in d && d.reconnectAt) problems.push(`unexpected reconnect ${out.reconnect_after}`);
        } catch (e) { problems.push(`error ${e instanceof Error ? e.message : e}`); }
        results.push({ c, problems });
      }
    }));

    const failed = results.filter((r) => r.problems.length);
    const missedOptOut = results.filter((r) => r.c.optOut === true && r.problems.some((p) => p.startsWith("opt_out") || p.startsWith("route")));
    const falseOptOut = results.filter((r) => r.c.optOut === false && r.problems.some((p) => p.startsWith("opt_out")));
    const score = (results.length - failed.length) / results.length;
    console.log(`\nReply suite: ${results.length - failed.length}/${results.length} (${(score * 100).toFixed(0)}%)`);
    for (const f of failed) console.log(`  ✗ ${f.c.id}: ${f.problems.join("; ")}`);

    expect(missedOptOut.map((r) => r.c.id)).toEqual([]);
    expect(falseOptOut.map((r) => r.c.id)).toEqual([]);
    expect(score).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});
