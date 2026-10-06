/**
 * Builds (or rebuilds) a clearly fictional demo tenant, "Northstar Staffing
 * (demo)", for client walkthroughs. Replies are run through the real AI
 * pipeline (handleReply) so the review queue, facts and memory are genuine
 * model output — about $0.05 of Luna per run.
 *
 * Safe by construction: its own org, outreach paused, every address on the
 * reserved .test / example.com names (never mailed), no allowed email domains.
 *
 *   npm run demo:seed        (needs .env.local exported, incl. OPENAI_API_KEY)
 *
 * Login: demo@northstar-staffing.test — password from DEMO_PASSWORD or
 * ~/.config/talent-radar/demo_password (created on first run, mode 600).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Database } from "../src/lib/database.types";
import { DEFAULT_STEPS } from "../src/lib/campaigns/templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SECRET_KEY!;
if (!url || !key) throw new Error("export .env.local first");
process.env.CRON_SECRET ??= "x".repeat(20);
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

const DAY = 86400000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const monthStart = (addMonths: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + addMonths, 1)).toISOString().slice(0, 10); };
const monthName = (addMonths: number) => new Date(`${monthStart(addMonths)}T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" });

type Person = { first: string; last: string; title: string; company: string; location: string; tz: string; industry: string; skills: string[] };
const P = (first: string, last: string, title: string, company: string, location: string, tz: string, industry: string, skills: string[]): Person => ({ first, last, title, company, location, tz, industry, skills });

// Replies are written per person; `later` = months until they said they'd be open.
const REPLIED: { p: Person; reply: (sender: string) => string; daysAgo: number; keepOpen?: boolean }[] = [
  { p: P("Marcus", "Hale", "Logistics Manager", "Redline Freight", "Dallas, TX", "America/Chicago", "logistics", ["TMS", "carrier management"]), daysAgo: 2, keepOpen: true,
    reply: (s) => `Hi ${s}, good timing actually. My bonus pays out in ${monthName(4)} so I'm not moving before then, but I'd like to start talking in ${monthName(3)}. Looking for a director-level role, ideally hybrid in Dallas. Base would need to be around $140k.` },
  { p: P("Priya", "Raman", "Senior Accountant", "Lakeview Health", "Chicago, IL", "America/Chicago", "finance", ["NetSuite", "month-end close", "GAAP"]), daysAgo: 1, keepOpen: true,
    reply: () => `Thanks for reaching out. I'm actively looking right now — my team is being restructured. Happy to jump on a call this week. I'm open to Chicago or fully remote.` },
  { p: P("Daniel", "Okoro", "DevOps Engineer", "Brightwave Software", "Austin, TX", "America/Chicago", "technology", ["Kubernetes", "Terraform", "AWS"]), daysAgo: 3, keepOpen: true,
    reply: () => `How did you get my details? Under CCPA I'd like to know what personal information you hold on me and where it came from.` },
  { p: P("Lena", "Fischer", "Operations Supervisor", "Harbor Point 3PL", "Savannah, GA", "America/New_York", "logistics", ["warehouse ops", "Lean"]), daysAgo: 1, keepOpen: true,
    reply: () => `maybe, depends`, },
  { p: P("Arjun", "Mehta", "Payroll Specialist", "Crestline Group", "Phoenix, AZ", "America/Phoenix", "finance", ["ADP", "multi-state payroll"]), daysAgo: 4, keepOpen: true,
    reply: () => `Not looking to leave, but for a remote payroll lead role I would listen. Notice period is 2 weeks.` },
  { p: P("Sofia", "Alvarez", "Transportation Planner", "Mesa Logistics", "El Paso, TX", "America/Denver", "logistics", ["route optimisation", "cross-border"]), daysAgo: 6,
    reply: () => `Hi, not right now. We're mid-implementation of a new TMS and I want to see it through. Check back after ${monthName(2)}.` },
  { p: P("Kevin", "Walsh", "Staff Accountant", "Pinecrest Capital", "Boston, MA", "America/New_York", "finance", ["reconciliations", "Excel"]), daysAgo: 8,
    reply: () => `Thanks. I'd be open in about ${monthName(5)} once I finish my CPA exams.` },
  { p: P("Hannah", "Brooks", "Customer Support Lead", "Nimbus Retail", "Denver, CO", "America/Denver", "customer support", ["Zendesk", "team leadership"]), daysAgo: 5,
    reply: () => `I'm open to the right opportunity. Remote only please, and I'd want to stay in a leadership position.` },
  { p: P("Tomás", "Reyes", "Fleet Manager", "Sunbelt Carriers", "Atlanta, GA", "America/New_York", "logistics", ["fleet maintenance", "DOT compliance"]), daysAgo: 9,
    reply: () => `Yes — I'm available now. Contract ended last month. Atlanta area or remote.` },
  { p: P("Grace", "Kim", "AP/AR Manager", "Vantage Foods", "Seattle, WA", "America/Los_Angeles", "finance", ["SAP", "collections"]), daysAgo: 10,
    reply: () => `Not looking, I'm happy here. Thanks though.` },
  { p: P("Omar", "Haddad", "Warehouse Manager", "Keystone Distribution", "Columbus, OH", "America/New_York", "logistics", ["WMS", "inventory control"]), daysAgo: 7,
    reply: () => `Probably open in Q${Math.floor(new Date(`${monthStart(4)}T00:00:00Z`).getUTCMonth() / 3) + 1} next year after our peak season. Relocation isn't an option for me.` },
  { p: P("Rachel", "Nguyen", "FP&A Analyst", "Summit Health Partners", "San Diego, CA", "America/Los_Angeles", "finance", ["forecasting", "Power BI"]), daysAgo: 11,
    reply: () => `I just started a new role so not for at least a year. Feel free to check back next year.` },
  { p: P("Ben", "Carter", "Dispatch Supervisor", "Great Lakes Haulage", "Detroit, MI", "America/Detroit", "logistics", ["dispatch", "driver relations"]), daysAgo: 3,
    reply: () => `Open to talking if the pay is right. I'm on $72k now and would want $85k minimum.` },
  { p: P("Isabel", "Duarte", "Executive Assistant", "Northgate Ventures", "Miami, FL", "America/New_York", "admin", ["calendar management", "board prep"]), daysAgo: 12,
    reply: () => `Thank you for thinking of me. I'm expecting a change around ${monthName(3)} — my executive is retiring. Let's talk then.` },
  { p: P("Chris", "Olsen", "Billing Specialist", "Ridgeway Medical", "Minneapolis, MN", "America/Chicago", "finance", ["medical billing", "Epic"]), daysAgo: 13,
    reply: () => `Please remove me from your mailing list.` },
  { p: P("Aisha", "Bello", "Supply Chain Analyst", "Orion Manufacturing", "Charlotte, NC", "America/New_York", "logistics", ["SQL", "demand planning"]), daysAgo: 4,
    reply: () => `Interested! I've been hoping to move into a planning manager role. Available to chat any afternoon.` },
  { p: P("Jake", "Morrison", "Bookkeeper", "Cedar & Co.", "Portland, OR", "America/Los_Angeles", "finance", ["QuickBooks", "Xero"]), daysAgo: 14,
    reply: () => `Not interested in agency roles, thanks.` },
  { p: P("Mei", "Tanaka", "Freight Broker", "Pacific Rim Logistics", "Long Beach, CA", "America/Los_Angeles", "logistics", ["brokerage", "LTL"]), daysAgo: 6,
    reply: () => `Maybe later in the year. Around ${monthName(6)} I'll know more about my commission plan.` },
];

const QUIET: Person[] = [
  P("Nathan", "Price", "Inventory Planner", "Blue Ridge Supply", "Nashville, TN", "America/Chicago", "logistics", ["forecasting"]),
  P("Olivia", "Grant", "Senior Bookkeeper", "Oakline Partners", "Raleigh, NC", "America/New_York", "finance", ["QuickBooks"]),
  P("Victor", "Lopez", "Yard Manager", "Rio Grande Transport", "San Antonio, TX", "America/Chicago", "logistics", ["yard ops"]),
  P("Emma", "Sullivan", "Payroll Manager", "Brightpath Schools", "Philadelphia, PA", "America/New_York", "finance", ["Paylocity"]),
  P("Samuel", "Adeyemi", "Import Coordinator", "Gateway Customs", "Houston, TX", "America/Chicago", "logistics", ["customs", "ACE"]),
  P("Chloe", "Martin", "Accounts Payable Lead", "Silverline Hotels", "Las Vegas, NV", "America/Los_Angeles", "finance", ["AP automation"]),
  P("Ryan", "Doyle", "Operations Manager", "Metro Courier", "New York, NY", "America/New_York", "logistics", ["last mile"]),
  P("Fatima", "Zahra", "Tax Associate", "Hartwell CPAs", "Newark, NJ", "America/New_York", "finance", ["1040", "1120"]),
  P("Luke", "Bennett", "Logistics Coordinator", "Prairie Grain Co.", "Omaha, NE", "America/Chicago", "logistics", ["rail"]),
  P("Zoe", "Harper", "Controller", "Lumen Studios", "Los Angeles, CA", "America/Los_Angeles", "finance", ["consolidations"]),
  P("Ethan", "Cole", "Procurement Specialist", "Ironclad Tools", "Pittsburgh, PA", "America/New_York", "logistics", ["sourcing"]),
  P("Maya", "Patel", "Credit Analyst", "Frontier Bank", "Kansas City, MO", "America/Chicago", "finance", ["credit risk"]),
];

const INITIAL = (p: Person, sender: string) => `Hi ${p.first},\n\nI'm ${sender} with Northstar Staffing — we work with firms in ${p.industry}. I'm not writing about a specific vacancy; I'm mapping who in your field might be open to a move over the next year.\n\nAre you open to opportunities right now? If not, is there a better time for me to check back?\n\n${sender}\nNorthstar Staffing`;

function password() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const dir = path.join(homedir(), ".config", "talent-radar"), f = path.join(dir, "demo_password");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  mkdirSync(dir, { recursive: true });
  const pw = `Demo-${randomBytes(9).toString("base64url")}`;
  writeFileSync(f, pw + "\n", { mode: 0o600 });
  return pw;
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error || data == null) throw new Error(`${what}: ${error?.message ?? "no data"}`);
  return data as NonNullable<T>;
}

async function main() {
  const { handleReply } = await import("../src/lib/workers/inbound");
  const { scheduleReconnect } = await import("../src/lib/workers/reconnect");

  // 1. Fresh org (cascade removes everything from a previous run).
  await db.from("orgs").delete().eq("slug", "demo");
  const org = await must(db.from("orgs").insert({ name: "Northstar Staffing (demo)", slug: "demo", brand: { logo_text: "NS", primary: "#1F3A5F", accent: "#E8A33D" }, allowed_email_domains: [] }).select("id").single(), "org");
  await must(db.from("org_settings").insert({ org_id: org.id, outreach_paused: true, approval_required: true, ai_enabled: true, ai_monthly_budget_usd: 5, max_outreach_per_day: 120, matching_enabled: true, mailing_address: "100 Example Plaza, Suite 400, Dallas, TX 75201, USA" }).select("org_id"), "settings");

  // 2. Demo login.
  const email = "demo@northstar-staffing.test", pw = password();
  let userId = (await db.rpc("find_user_id_by_email", { p_email: email })).data ?? null;
  if (userId) await db.auth.admin.updateUserById(userId, { password: pw });
  else userId = (await db.auth.admin.createUser({ email, password: pw, email_confirm: true })).data.user!.id;
  await db.from("org_members").delete().eq("user_id", userId);
  await must(db.from("org_members").insert({ org_id: org.id, user_id: userId, role: "admin", display_name: "Demo Recruiter" }).select("org_id"), "member");

  // 3. Senders + campaign.
  const senders = await must(db.from("senders").insert([
    { org_id: org.id, email: "alex@talent.northstar-staffing.test", display_name: "Alex", status: "WARMED", daily_cap_new: 40, daily_cap_followup: 20, warmup_started_at: iso(now - 30 * DAY) },
    { org_id: org.id, email: "jordan@talent.northstar-staffing.test", display_name: "Jordan", status: "WARMING", daily_cap_new: 20, daily_cap_followup: 10, warmup_started_at: iso(now - 9 * DAY) },
  ]).select("id, display_name, email"), "senders");
  const campaign = await must(db.from("campaigns").insert({ org_id: org.id, name: "US logistics & finance — Q4 mapping", objective: "Map availability of mid-level logistics and finance professionals for 2027 hiring", sector: "logistics and finance", status: "ACTIVE", sender_ids: senders.map((s) => s.id), daily_sender_limit: 40 }).select("id").single(), "campaign");
  await must(db.from("campaign_steps").insert(DEFAULT_STEPS.map((s) => ({ ...s, org_id: org.id, campaign_id: campaign.id, template_body: s.template_body }))).select("id"), "steps");

  const mkCandidate = (p: Person, extra: Partial<Database["public"]["Tables"]["candidates"]["Insert"]> = {}) => {
    const e = `${p.first}.${p.last}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "") + "@example.com";
    return { org_id: org.id, email: e, email_normalized: e, first_name: p.first, last_name: p.last, current_title: p.title, current_company: p.company, location: p.location, timezone: p.tz, industry: p.industry, skills: p.skills, source: "consented database", ...extra };
  };

  // 4. Quiet candidates: contacted, waiting, follow-ups queued (these never send: org paused, example.com).
  //    The last three went out this morning so "sent today" on the dashboard is not empty.
  for (const [i, p] of QUIET.entries()) {
    const sentAt = i >= 9 ? now - (i - 8) * 3600000 : now - (1 + (i % 3)) * DAY - 3 * 3600000;
    const row = mkCandidate(p, { communication_status: "WAITING_FOR_REPLY", last_contacted_at: iso(sentAt) });
    const c = await must(db.from("candidates").insert(row).select("id").single(), "quiet cand");
    const s = senders[i % 2];
    const conv = await must(db.from("conversations").insert({ org_id: org.id, candidate_id: c.id, campaign_id: campaign.id, sender_id: s.id, thread_token: randomBytes(6).toString("hex"), last_message_at: iso(sentAt) }).select("id").single(), "conv");
    await must(db.from("messages").insert({ org_id: org.id, conversation_id: conv.id, candidate_id: c.id, campaign_id: campaign.id, sender_id: s.id, direction: "OUTBOUND", from_address: s.email, to_address: row.email, subject: `Quick question, ${p.first}`, text_body: INITIAL(p, s.display_name), message_type: "INITIAL", step_number: 1, sent_at: iso(sentAt), delivery_status: "DELIVERED", provider_message_id: `demo_${randomBytes(6).toString("hex")}` }).select("id"), "msg");
    await db.from("campaign_enrollments").insert({ org_id: org.id, campaign_id: campaign.id, candidate_id: c.id, current_step: 1, unanswered_count: 1, enrolled_at: iso(sentAt - DAY) });
    await db.from("scheduled_actions").insert({ org_id: org.id, candidate_id: c.id, campaign_id: campaign.id, conversation_id: conv.id, action_type: "SEND_FOLLOW_UP", payload: { step_number: 2 }, scheduled_for: iso(sentAt + 4 * DAY), status: "PENDING", created_by_label: "dispatcher:next-step" });
  }

  // 5. Replied candidates: real AI pipeline.
  const results: string[] = [];
  for (const [i, r] of REPLIED.entries()) {
    const s = senders[i % 2];
    const sentAt = now - (r.daysAgo + 3) * DAY;
    const repliedAt = now - r.daysAgo * DAY + 2 * 3600000;
    const cand = await must(db.from("candidates").insert(mkCandidate(r.p, { communication_status: "WAITING_FOR_REPLY", last_contacted_at: iso(sentAt) })).select("*").single(), "cand");
    const conv = await must(db.from("conversations").insert({ org_id: org.id, candidate_id: cand.id, campaign_id: campaign.id, sender_id: s.id, thread_token: randomBytes(6).toString("hex"), last_message_at: iso(repliedAt) }).select("*").single(), "conv");
    await db.from("campaign_enrollments").insert({ org_id: org.id, campaign_id: campaign.id, candidate_id: cand.id, current_step: 1, unanswered_count: 1, enrolled_at: iso(sentAt - DAY) });
    await must(db.from("messages").insert({ org_id: org.id, conversation_id: conv.id, candidate_id: cand.id, campaign_id: campaign.id, sender_id: s.id, direction: "OUTBOUND", from_address: s.email, to_address: cand.email, subject: `Quick question, ${r.p.first}`, text_body: INITIAL(r.p, s.display_name), message_type: "INITIAL", step_number: 1, sent_at: iso(sentAt), delivery_status: "DELIVERED", provider_message_id: `demo_${randomBytes(6).toString("hex")}` }).select("id"), "out");
    const text = r.reply(s.display_name);
    const inbound = await must(db.from("messages").insert({ org_id: org.id, conversation_id: conv.id, candidate_id: cand.id, campaign_id: campaign.id, sender_id: s.id, direction: "INBOUND", from_address: cand.email, to_address: s.email, subject: `Re: Quick question, ${r.p.first}`, text_body: text, reply_text: text, message_type: "REPLY", received_at: iso(repliedAt), delivery_status: "RECEIVED", provider_message_id: `demo_${randomBytes(6).toString("hex")}` }).select("id").single(), "in");

    const out = await handleReply(db, { orgId: org.id, candidate: cand, conversation: conv, messageId: inbound.id, replyText: text, subject: `Re: Quick question, ${r.p.first}` });
    results.push(`${r.p.first} ${r.p.last}: ${out.note}`);

    // Backdate what the pipeline stamped "now" so the history reads naturally.
    await db.from("candidates").update({ last_replied_at: iso(repliedAt), last_verified_at: iso(repliedAt) }).eq("id", cand.id);
    await db.from("candidate_facts").update({ reported_at: iso(repliedAt) }).eq("candidate_id", cand.id);
    await db.from("audit_events").update({ created_at: iso(repliedAt + 60000) }).eq("candidate_id", cand.id);
    await db.from("review_items").update({ created_at: iso(repliedAt + 60000) }).eq("candidate_id", cand.id);

    // Older conversations: a recruiter already approved the AI draft (as would happen in the pilot).
    const { data: item } = await db.from("review_items").select("*").eq("candidate_id", cand.id).eq("status", "OPEN").maybeSingle();
    if (item && !r.keepOpen) {
      const ai = (item.ai_classification ?? {}) as { draft_subject?: string; draft_model?: string; draft_prompt_version?: string; reconnect_at?: string | null };
      const replyAt = repliedAt + 3 * 3600000;
      if (item.draft_reply) {
        await db.from("messages").insert({ org_id: org.id, conversation_id: conv.id, candidate_id: cand.id, sender_id: s.id, direction: "OUTBOUND", from_address: s.email, to_address: cand.email, subject: ai.draft_subject ?? `Re: Quick question, ${r.p.first}`, text_body: item.draft_reply, message_type: "REPLY", sent_at: iso(replyAt), delivery_status: "DELIVERED", ai_generated: true, ai_model: ai.draft_model ?? null, prompt_version: ai.draft_prompt_version ?? null, approved_by: userId, provider_message_id: `demo_${randomBytes(6).toString("hex")}` });
        await db.from("audit_events").insert({ org_id: org.id, candidate_id: cand.id, event_type: "REPLY_APPROVED", actor: "USER", actor_user_id: userId, decision: "SEND_REPLY", reason: "AI draft sent as written", created_at: iso(replyAt - 600000) });
      }
      await db.from("review_items").update({ status: item.draft_reply ? "APPROVED" : "SKIPPED", resolved_by: userId, resolved_at: iso(replyAt) }).eq("id", item.id);
      await db.from("candidates").update({ communication_status: item.draft_reply ? "CONVERSATION_ACTIVE" : "CLOSED", last_contacted_at: iso(replyAt) }).eq("id", cand.id);
      if (ai.reconnect_at) await scheduleReconnect(db, { orgId: org.id, candidateId: cand.id, conversationId: conv.id, at: new Date(`${ai.reconnect_at}T14:00:00Z`), statusAfter: "NURTURE_SCHEDULED", label: "review:approve", actorUserId: userId });
    }
  }

  // 5b. A resume on one profile so the demo shows resume parsing (fictional candidate, fixture PDF).
  {
    const { parseResumeIntoCandidate } = await import("../src/lib/resume/parse");
    const { extractResumeText } = await import("../src/lib/resume/extract");
    const { data: priya } = await db.from("candidates").select("*").eq("org_id", org.id).eq("first_name", "Priya").maybeSingle();
    if (priya) {
      const bytes = new Uint8Array(readFileSync(path.join(import.meta.dirname, "fixtures", "sample-resume-priya-raman.pdf")));
      const text = await extractResumeText(bytes.slice(), "pdf");
      const key = `${org.id}/${priya.id}/demo-priya_raman.pdf`;
      await db.storage.from("resumes").upload(key, bytes, { contentType: "application/pdf", upsert: true });
      const r = await parseResumeIntoCandidate(db, { candidate: priya, text, file: { path: key, filename: "priya_raman.pdf", size: bytes.length }, userId });
      results.push(`Resume parsed for Priya Raman: ${r.ok ? `${r.data.skills.length} skills` : r.reason}`);
    }
  }

  // 6. V2 preview: readiness for everyone, two open requirements, matching run on the first.
  const { refreshReadiness } = await import("../src/lib/matching/readiness");
  const { runMatching } = await import("../src/lib/matching/match");
  await refreshReadiness(db, { orgId: org.id });
  const reqs = await must(db.from("requirements").insert([
    { org_id: org.id, created_by: userId, title: "Logistics Operations Manager", client_name: "Midwest 3PL client (confidential)", location: "Dallas, TX", remote_policy: "hybrid", comp_min: 110000, comp_max: 135000,
      must_have: ["3PL or freight operations leadership", "TMS or WMS experience", "Managing a team of 10+"], nice_to_have: ["Lean / continuous improvement", "Cross-border freight"],
      description: "Run day-to-day operations for a growing 3PL site: carrier management, warehouse throughput, KPIs and a team of 15 supervisors and coordinators. Hybrid, 3 days on site in Dallas." },
    { org_id: org.id, created_by: userId, title: "Senior Accountant (Remote)", client_name: "Healthcare group", location: "Remote, US", remote_policy: "remote", comp_min: 85000, comp_max: 100000,
      must_have: ["Month-end close", "GAAP", "NetSuite or SAP"], nice_to_have: ["Healthcare billing"], description: "Own month-end close and reconciliations for a multi-entity healthcare group. Fully remote, US hours." },
  ]).select("id, title"), "requirements");
  const run = await runMatching(db, { orgId: org.id, requirementId: reqs[0].id, userId });
  const run2 = await runMatching(db, { orgId: org.id, requirementId: reqs[1].id, userId });
  results.push(`\nMatching: "${reqs[0].title}" ${run.scored} scored ($${run.costUsd.toFixed(3)}), "${reqs[1].title}" ${run2.scored} scored ($${run2.costUsd.toFixed(3)}) with ${run.model}`);

  const { data: open } = await db.from("review_items").select("category").eq("org_id", org.id).eq("status", "OPEN");
  const { data: spend } = await db.from("ai_usage").select("cost_usd").eq("org_id", org.id);
  console.log(results.join("\n"));
  console.log(`\nDemo org ready: ${QUIET.length + REPLIED.length} candidates, ${open?.length ?? 0} open review items (${(open ?? []).map((o) => o.category).join(", ")}), AI cost $${(spend ?? []).reduce((a, r) => a + Number(r.cost_usd), 0).toFixed(4)}`);
  console.log(`Login: ${email}  (password in ~/.config/talent-radar/demo_password or DEMO_PASSWORD)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
