import "server-only";
import { randomBytes } from "node:crypto";
import type { Db, Tables } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { checkEligibility, checkLimits } from "@/lib/policy/eligibility";
import { nextSendSlot, isValidTimeZone, partsIn } from "@/lib/policy/send-window";
import { isSuppressed, suppress } from "@/lib/policy/suppression";
import { merge } from "@/lib/campaigns/templates";
import { sendEmail } from "@/lib/email/resend";

type Action = Tables<"scheduled_actions">;
const SEQUENCE_TYPES = new Set(["SEND_INITIAL", "SEND_FOLLOW_UP", "SEND_FINAL", "SEND_NURTURE", "RECONNECT"]);
const STEP_TO_ACTION: Record<string, Action["action_type"]> = { INITIAL: "SEND_INITIAL", FOLLOW_UP: "SEND_FOLLOW_UP", FINAL: "SEND_FINAL", NURTURE: "SEND_NURTURE" };
const ACTION_TO_KIND: Record<string, Tables<"messages">["message_type"]> = { SEND_INITIAL: "INITIAL", SEND_FOLLOW_UP: "FOLLOW_UP", SEND_FINAL: "FINAL", SEND_NURTURE: "NURTURE", RECONNECT: "RECONNECT", SEND_REPLY: "REPLY" };

export type DispatchSummary = { claimed: number; sent: number; deferred: number; cancelled: number; failed: number; details: string[] };

export async function runDispatcher(db: Db, opts: { limit?: number; workerId?: string } = {}): Promise<DispatchSummary> {
  const workerId = opts.workerId ?? `w-${randomBytes(3).toString("hex")}`;
  const { data: actions, error } = await db.rpc("claim_scheduled_actions", { p_limit: opts.limit ?? 50, p_worker: workerId });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const summary: DispatchSummary = { claimed: actions?.length ?? 0, sent: 0, deferred: 0, cancelled: 0, failed: 0, details: [] };

  for (const a of actions ?? []) {
    try {
      const r = await processAction(db, a);
      summary[r.outcome]++;
      summary.details.push(`${a.action_type} ${a.candidate_id.slice(0, 8)} → ${r.outcome}${r.reason ? ` (${r.reason})` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const giveUp = a.attempt_count >= 3;
      await db.from("scheduled_actions").update({
        status: giveUp ? "FAILED" : "PENDING",
        last_error: msg.slice(0, 500),
        scheduled_for: giveUp ? a.scheduled_for : new Date(Date.now() + a.attempt_count * 10 * 60000).toISOString(),
        locked_at: null, locked_by: null,
      }).eq("id", a.id);
      summary.failed++;
      summary.details.push(`${a.action_type} ${a.candidate_id.slice(0, 8)} → error: ${msg}`);
      await audit(db, { orgId: a.org_id, candidateId: a.candidate_id, eventType: "ACTION_ERROR", actor: "SYSTEM", decision: giveUp ? "FAILED" : "RETRY", reason: msg.slice(0, 300), metadata: { action_id: a.id } });
    }
  }
  return summary;
}

type Outcome = { outcome: "sent" | "deferred" | "cancelled" | "failed"; reason?: string };

async function finish(db: Db, a: Action, status: Action["status"], reason?: string) {
  await db.from("scheduled_actions").update({ status, last_error: reason ?? null, completed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", a.id);
}
async function defer(db: Db, a: Action, until: Date, reason: string): Promise<Outcome> {
  await db.from("scheduled_actions").update({ status: "PENDING", scheduled_for: until.toISOString(), last_error: reason, locked_at: null, locked_by: null }).eq("id", a.id);
  return { outcome: "deferred", reason };
}

async function processAction(db: Db, a: Action): Promise<Outcome> {
  if (a.action_type === "HUMAN_REVIEW" || a.action_type === "REFRESH_PROFILE") {
    await finish(db, a, "COMPLETED");
    return { outcome: "sent", reason: "no-op" };
  }
  if (!SEQUENCE_TYPES.has(a.action_type) && a.action_type !== "SEND_REPLY") {
    await finish(db, a, "CANCELLED", "unknown action");
    return { outcome: "cancelled", reason: "unknown action" };
  }

  const now = new Date();
  const [{ data: cand }, { data: settings }, { data: org }] = await Promise.all([
    db.from("candidates").select("*").eq("id", a.candidate_id).single(),
    db.from("org_settings").select("*").eq("org_id", a.org_id).single(),
    db.from("orgs").select("name").eq("id", a.org_id).single(),
  ]);
  if (!cand || !settings || !org) { await finish(db, a, "CANCELLED", "missing candidate/org"); return { outcome: "cancelled", reason: "missing rows" }; }

  // 1. Suppression — always first, against the list itself.
  if (await isSuppressed(db, a.org_id, cand.email_normalized)) {
    if (cand.communication_status !== "SUPPRESSED") await suppress(db, { orgId: a.org_id, emailNormalized: cand.email_normalized, candidateId: cand.id, reason: "MANUAL", byLabel: "dispatcher:list-check", note: "found on list at send time" });
    await finish(db, a, "CANCELLED", "SUPPRESSED");
    return { outcome: "cancelled", reason: "SUPPRESSED" };
  }

  const campaign = a.campaign_id ? (await db.from("campaigns").select("*").eq("id", a.campaign_id).single()).data : null;
  const enrollment = a.campaign_id ? (await db.from("campaign_enrollments").select("*").eq("campaign_id", a.campaign_id).eq("candidate_id", cand.id).maybeSingle()).data : null;

  // 2. Eligibility
  const verdict = checkEligibility({
    candidate: cand, settings, campaignStatus: campaign?.status ?? null,
    unansweredCount: enrollment?.unanswered_count ?? 0, isSuppressed: false, actionType: a.action_type, now,
  });
  if (!verdict.ok) {
    if (verdict.retryAt) return defer(db, a, verdict.retryAt, verdict.reason);
    await finish(db, a, "CANCELLED", verdict.reason);
    await audit(db, { orgId: a.org_id, candidateId: cand.id, eventType: "SEND_BLOCKED", actor: "SYSTEM", decision: "CANCELLED", reason: verdict.reason, metadata: { action_id: a.id, action_type: a.action_type } });
    return { outcome: "cancelled", reason: verdict.reason };
  }

  // 3. Send window in the candidate's time zone (replies are exempt: they answer a human promptly).
  const tz = isValidTimeZone(cand.timezone) ? cand.timezone : settings.default_timezone;
  const window = {
    days: campaign?.send_days ?? settings.send_days,
    start: (campaign?.send_window_start ?? settings.send_window_start).slice(0, 5),
    end: (campaign?.send_window_end ?? settings.send_window_end).slice(0, 5),
  };
  if (a.action_type !== "SEND_REPLY") {
    const slot = nextSendSlot(now, tz, window);
    if (slot.getTime() - now.getTime() > 60000) return defer(db, a, slot, `SEND_WINDOW (${tz})`);
  }

  // 4. Sender + limits
  const senderIds = campaign?.sender_ids?.length ? campaign.sender_ids : null;
  let sq = db.from("senders").select("*").eq("org_id", a.org_id).neq("status", "PAUSED");
  if (senderIds) sq = sq.in("id", senderIds);
  const { data: senders } = await sq;
  if (!senders?.length) { await finish(db, a, "CANCELLED", "NO_SENDER"); return { outcome: "cancelled", reason: "NO_SENDER" }; }

  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todays } = await db.from("messages").select("sender_id, campaign_id, message_type").eq("org_id", a.org_id).eq("direction", "OUTBOUND").gte("sent_at", dayStart.toISOString());
  const orgSentToday = todays?.length ?? 0;
  const isNew = a.action_type === "SEND_INITIAL";

  // Prefer the sender used earlier in this conversation; otherwise the least-loaded one.
  let conversation = a.conversation_id
    ? (await db.from("conversations").select("*").eq("id", a.conversation_id).maybeSingle()).data
    : (await db.from("conversations").select("*").eq("candidate_id", cand.id).eq("status", "OPEN").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;

  const load = (sid: string) => (todays ?? []).filter((m) => m.sender_id === sid && (isNew ? m.message_type === "INITIAL" : m.message_type !== "INITIAL")).length;
  const preferred = conversation?.sender_id ? senders.find((s) => s.id === conversation!.sender_id) : undefined;
  const sender = preferred ?? [...senders].sort((x, y) => load(x.id) - load(y.id))[0];
  const senderCap = isNew ? Math.min(sender.daily_cap_new, settings.max_new_per_sender_per_day) : Math.min(sender.daily_cap_followup, settings.max_followups_per_sender_per_day);
  const campaignSenderSent = (todays ?? []).filter((m) => m.sender_id === sender.id && m.campaign_id === a.campaign_id && m.message_type === "INITIAL").length;

  const limits = checkLimits({
    orgSentToday, orgCap: settings.max_outreach_per_day,
    senderSentToday: load(sender.id), senderCap,
    campaignSenderSentToday: isNew ? campaignSenderSent : 0, campaignSenderCap: isNew ? (campaign?.daily_sender_limit ?? 10000) : 10000,
  });
  if (!limits.ok) {
    // Try again at the start of the next window day.
    const p = partsIn(now, tz);
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0));
    return defer(db, a, nextSendSlot(tomorrow, tz, window), limits.reason);
  }

  // 5. Compose
  const payload = (a.payload ?? {}) as { step_number?: number; subject?: string; text?: string; review_item_id?: string };
  let subject: string, text: string, stepNumber: number | null = null, useAi = false;

  if (a.action_type === "SEND_REPLY") {
    if (!payload.text) { await finish(db, a, "CANCELLED", "EMPTY_REPLY"); return { outcome: "cancelled", reason: "EMPTY_REPLY" }; }
    subject = payload.subject ?? "Re: your reply";
    text = payload.text;
  } else {
    const { data: step } = campaign && payload.step_number
      ? await db.from("campaign_steps").select("*").eq("campaign_id", campaign.id).eq("step_number", payload.step_number).maybeSingle()
      : { data: null };
    if (!step) { await finish(db, a, "CANCELLED", "NO_STEP"); return { outcome: "cancelled", reason: "NO_STEP" }; }
    stepNumber = step.step_number;
    useAi = step.use_ai;
    const vars = { first_name: cand.first_name, last_name: cand.last_name, sender_name: sender.display_name, org_name: org.name, sector: campaign?.sector, current_company: cand.current_company, current_title: cand.current_title };
    subject = merge(step.template_subject ?? "Quick question, {{first_name}}", vars);
    text = merge(step.template_body ?? "", vars);
    // AI-written first touch plugs in here (week 2). Until then use_ai falls back to the template.
  }
  if (!text.trim()) { await finish(db, a, "CANCELLED", "EMPTY_BODY"); return { outcome: "cancelled", reason: "EMPTY_BODY" }; }

  if (!conversation) {
    const token = randomBytes(6).toString("hex");
    const { data: conv, error } = await db.from("conversations").insert({ org_id: a.org_id, candidate_id: cand.id, campaign_id: a.campaign_id, sender_id: sender.id, thread_token: token }).select("*").single();
    if (error || !conv) throw new Error(`conversation insert failed: ${error?.message}`);
    conversation = conv;
  }

  const [local, domain] = sender.email.split("@");
  const replyTo = `${local}+t_${conversation.thread_token}@${domain}`;
  const unsubscribeUrl = `${env().APP_URL}/api/unsubscribe/${conversation.thread_token}`;
  const lastOut = (await db.from("messages").select("internet_message_id").eq("conversation_id", conversation.id).eq("direction", "OUTBOUND").order("created_at", { ascending: false }).limit(1).maybeSingle()).data;

  // 6. Send
  const { id: providerId } = await sendEmail({
    fromName: sender.display_name, fromEmail: sender.email, to: cand.email, replyTo, subject, text, unsubscribeUrl,
    inReplyTo: lastOut?.internet_message_id ?? null,
    tags: { org: a.org_id.slice(0, 8), type: a.action_type },
  });

  // 7. Record — the email is out; from here nothing may throw, or a retry would send it twice.
  // Complete the action first so the one-pending-send index lets the next step in.
  await finish(db, a, "COMPLETED");
  const kind = ACTION_TO_KIND[a.action_type] ?? "MANUAL";
  const problems: string[] = [];
  const tryStep = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const r = await fn();
      if (r.error) problems.push(`${label}: ${r.error.message}`);
    } catch (e) { problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  await tryStep("message", () => db.from("messages").insert({
    org_id: a.org_id, conversation_id: conversation.id, candidate_id: cand.id, campaign_id: a.campaign_id, sender_id: sender.id,
    provider: "resend", provider_message_id: providerId, direction: "OUTBOUND", from_address: sender.email, to_address: cand.email,
    subject, text_body: text, message_type: kind, step_number: stepNumber, sent_at: now.toISOString(), delivery_status: "SENT",
    ai_generated: false, ai_model: null, prompt_version: null,
  }));
  await tryStep("conversation", () => db.from("conversations").update({ last_message_at: now.toISOString() }).eq("id", conversation.id));

  // 8. State + next step
  let nextAt: Date | null = null;
  if (campaign && stepNumber != null) {
    const { data: next } = await db.from("campaign_steps").select("*").eq("campaign_id", campaign.id).eq("step_number", stepNumber + 1).maybeSingle();
    if (next) {
      const at = nextSendSlot(new Date(now.getTime() + next.delay_days * 86400000), tz, window);
      nextAt = at;
      await tryStep("next-step", () => db.from("scheduled_actions").insert({
        org_id: a.org_id, candidate_id: cand.id, campaign_id: campaign.id, conversation_id: conversation.id,
        action_type: STEP_TO_ACTION[next.message_type] ?? "SEND_FOLLOW_UP", payload: { step_number: next.step_number },
        scheduled_for: at.toISOString(), status: "PENDING", created_by_label: "dispatcher:next-step",
      }));
    }
    if (enrollment) {
      await tryStep("enrollment", () => db.from("campaign_enrollments").update({
        current_step: stepNumber, unanswered_count: enrollment.unanswered_count + 1,
        status: next ? "ENROLLED" : "COMPLETED", completed_at: next ? null : now.toISOString(),
      }).eq("id", enrollment.id));
    }
  }
  await tryStep("candidate", () => db.from("candidates").update({
    last_contacted_at: now.toISOString(),
    communication_status: a.action_type === "SEND_REPLY" ? cand.communication_status : nextAt ? "WAITING_FOR_REPLY" : "CLOSED",
    next_contact_at: nextAt?.toISOString() ?? null,
  }).eq("id", cand.id));

  await audit(db, {
    orgId: a.org_id, candidateId: cand.id, eventType: problems.length ? "EMAIL_SENT_WITH_ERRORS" : "EMAIL_SENT", actor: "SYSTEM", decision: a.action_type,
    reason: `step ${stepNumber ?? "-"} via ${sender.email}${problems.length ? " · " + problems.join("; ") : ""}`, outputRef: providerId,
    metadata: { action_id: a.id, next_at: nextAt?.toISOString() ?? null },
  });
  return { outcome: "sent" };
}
