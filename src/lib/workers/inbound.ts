import "server-only";
import type { Db, Tables } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getReceivedEmail, extractAddress } from "@/lib/email/resend";
import { extractReplyText, htmlToText, detectAutomated, threadTokenFromAddresses } from "@/lib/email/parse-reply";
import { detectOptOut } from "@/lib/policy/opt-out";
import { suppress } from "@/lib/policy/suppression";

type Event = Tables<"inbound_events">;

/** Process every unprocessed webhook event. Safe to run repeatedly. */
export async function processInboundEvents(db: Db, limit = 50) {
  const { data: events } = await db.from("inbound_events").select("*").is("processed_at", null).order("received_at").limit(limit);
  const out: string[] = [];
  for (const ev of events ?? []) {
    try {
      const r = await processEvent(db, ev);
      await db.from("inbound_events").update({ processed_at: new Date().toISOString(), error: null, org_id: r.orgId ?? null }).eq("id", ev.id);
      out.push(`${ev.event_type} → ${r.note}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("inbound_events").update({ processed_at: new Date().toISOString(), error: msg.slice(0, 500) }).eq("id", ev.id);
      out.push(`${ev.event_type} → error: ${msg}`);
    }
  }
  return out;
}

async function processEvent(db: Db, ev: Event): Promise<{ orgId: string | null; note: string }> {
  const payload = ev.payload as { type?: string; data?: Record<string, unknown> };
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (ev.event_type === "email.received") return processReceived(db, String(data.email_id ?? ""));

  // Outbound delivery events: find our message by provider id.
  const providerId = String(data.email_id ?? "");
  if (!providerId) return { orgId: null, note: "no email_id" };
  const { data: msg } = await db.from("messages").select("id, org_id, candidate_id, to_address").eq("provider", "resend").eq("provider_message_id", providerId).maybeSingle();
  if (!msg) return { orgId: null, note: "message not found" };

  const status: Record<string, Tables<"messages">["delivery_status"]> = { "email.sent": "SENT", "email.delivered": "DELIVERED", "email.bounced": "BOUNCED", "email.complained": "COMPLAINED", "email.delivery_delayed": "SENT" };
  const st = status[ev.event_type];
  if (st) await db.from("messages").update({ delivery_status: st }).eq("id", msg.id);

  if (ev.event_type === "email.bounced") {
    const bounce = (data.bounce ?? {}) as { type?: string; subType?: string; message?: string };
    const transient = /transient|soft/i.test(bounce.type ?? "");
    if (!transient) {
      await suppress(db, { orgId: msg.org_id, emailNormalized: msg.to_address.toLowerCase(), candidateId: msg.candidate_id, reason: "BOUNCE", byLabel: "webhook:bounce", note: bounce.message ?? bounce.subType });
      return { orgId: msg.org_id, note: "bounced → suppressed" };
    }
    return { orgId: msg.org_id, note: "transient bounce" };
  }
  if (ev.event_type === "email.complained") {
    await suppress(db, { orgId: msg.org_id, emailNormalized: msg.to_address.toLowerCase(), candidateId: msg.candidate_id, reason: "COMPLAINT", byLabel: "webhook:complaint" });
    return { orgId: msg.org_id, note: "complaint → suppressed" };
  }
  return { orgId: msg.org_id, note: st ?? "ignored" };
}

async function processReceived(db: Db, emailId: string): Promise<{ orgId: string | null; note: string }> {
  if (!emailId) return { orgId: null, note: "no email_id" };
  const { data: dup } = await db.from("messages").select("id").eq("provider", "resend").eq("provider_message_id", emailId).maybeSingle();
  if (dup) return { orgId: null, note: "already stored" };

  const mail = await getReceivedEmail(emailId);
  const fromAddr = extractAddress(mail.from) ?? "";
  const addresses = [...(mail.to ?? []), ...(mail.received_for ?? []), ...(mail.reply_to ?? [])].map((x) => extractAddress(x) ?? "");

  // Match the conversation: plus-token first, then In-Reply-To, then sender address within the receiving org.
  let conversation: Tables<"conversations"> | null = null;
  const token = threadTokenFromAddresses(addresses);
  if (token) conversation = (await db.from("conversations").select("*").eq("thread_token", token).maybeSingle()).data;

  const inReplyTo = mail.headers["in-reply-to"] ?? null;
  if (!conversation && inReplyTo) {
    const { data: m } = await db.from("messages").select("conversation_id").eq("internet_message_id", inReplyTo).maybeSingle();
    if (m) conversation = (await db.from("conversations").select("*").eq("id", m.conversation_id).maybeSingle()).data;
  }
  let orgId = conversation?.org_id ?? null;
  let candidate: Tables<"candidates"> | null = null;
  if (conversation) candidate = (await db.from("candidates").select("*").eq("id", conversation.candidate_id).single()).data;

  if (!candidate) {
    // Identify the org from the receiving address domain, then the candidate by sender address.
    const domains = [...new Set(addresses.map((x) => x.split("@")[1]).filter(Boolean))];
    if (domains.length) {
      const { data: senders } = await db.from("senders").select("org_id, email");
      const match = (senders ?? []).find((s) => domains.includes(s.email.split("@")[1]));
      orgId = match?.org_id ?? orgId;
    }
    if (orgId) {
      candidate = (await db.from("candidates").select("*").eq("org_id", orgId).eq("email_normalized", fromAddr).maybeSingle()).data;
      if (candidate) conversation = (await db.from("conversations").select("*").eq("candidate_id", candidate.id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    }
  }
  if (!candidate || !orgId) return { orgId, note: `unmatched from ${fromAddr}` };

  if (!conversation) {
    const { data: conv } = await db.from("conversations").insert({ org_id: orgId, candidate_id: candidate.id, thread_token: emailId.replace(/-/g, "").slice(0, 24) }).select("*").single();
    conversation = conv;
  }
  if (!conversation) throw new Error("could not create conversation");

  const rawText = mail.text ?? (mail.html ? htmlToText(mail.html) : "");
  const replyText = extractReplyText(rawText);
  const automated = detectAutomated({ headers: mail.headers, from: fromAddr, subject: mail.subject ?? "", text: rawText });
  const now = new Date().toISOString();

  const { data: stored, error } = await db.from("messages").insert({
    org_id: orgId, conversation_id: conversation.id, candidate_id: candidate.id, campaign_id: conversation.campaign_id, sender_id: conversation.sender_id,
    provider: "resend", provider_message_id: emailId, internet_message_id: mail.message_id ?? null, in_reply_to: inReplyTo,
    direction: "INBOUND", from_address: fromAddr, to_address: addresses[0] ?? "", subject: mail.subject ?? null,
    text_body: rawText, html_body: mail.html ?? null, reply_text: replyText, message_type: "REPLY",
    received_at: mail.created_at ?? now, delivery_status: "RECEIVED",
  }).select("id").single();
  if (error || !stored) throw new Error(`message insert failed: ${error?.message}`);
  await db.from("conversations").update({ last_message_at: now }).eq("id", conversation.id);

  if (automated !== "NONE") {
    await audit(db, { orgId, candidateId: candidate.id, eventType: "INBOUND_AUTOMATED", actor: "SYSTEM", decision: automated, reason: mail.subject ?? "", inputRef: stored.id });
    if (automated === "BOUNCE") {
      await db.from("messages").update({ delivery_status: "BOUNCED" }).eq("conversation_id", conversation.id).eq("direction", "OUTBOUND").order("created_at", { ascending: false }).limit(1);
    }
    return { orgId, note: automated.toLowerCase() };
  }

  // Rule-based opt-out: no threshold, no AI.
  const opt = detectOptOut(replyText);
  if (opt.optOut) {
    await suppress(db, { orgId, emailNormalized: candidate.email_normalized, candidateId: candidate.id, reason: "OPT_OUT", byLabel: "rule:opt_out", note: `matched "${opt.phrase}"` });
    await db.from("candidates").update({ last_replied_at: now, last_verified_at: now }).eq("id", candidate.id);
    return { orgId, note: "opt-out → suppressed" };
  }

  // A real reply: stop the sequence, hand to a human (AI classification arrives in week 2).
  await Promise.all([
    db.from("scheduled_actions").update({ status: "CANCELLED", last_error: "candidate replied" }).eq("candidate_id", candidate.id).eq("status", "PENDING").in("action_type", ["SEND_FOLLOW_UP", "SEND_FINAL", "SEND_NURTURE", "RECONNECT"]),
    db.from("campaign_enrollments").update({ unanswered_count: 0 }).eq("candidate_id", candidate.id).eq("status", "ENROLLED"),
    db.from("candidates").update({ last_replied_at: now, last_verified_at: now, communication_status: "HUMAN_REVIEW", next_contact_at: null }).eq("id", candidate.id),
    db.from("review_items").insert({
      org_id: orgId, candidate_id: candidate.id, conversation_id: conversation.id, inbound_message_id: stored.id,
      category: "REPLY_RECEIVED", reason: "Reply received — AI classification not yet enabled, please read and respond.",
    }),
  ]);
  await audit(db, { orgId, candidateId: candidate.id, eventType: "REPLY_RECEIVED", actor: "SYSTEM", decision: "HUMAN_REVIEW", reason: "AI classification disabled", inputRef: stored.id });
  return { orgId, note: "reply → review queue" };
}
