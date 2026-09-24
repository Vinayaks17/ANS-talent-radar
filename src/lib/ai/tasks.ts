import "server-only";
import type { Db, Tables } from "@/lib/db";
import { runStructured, modelFor } from "./client";
import { classificationSchema, classificationJsonSchema, emailDraftSchema, emailDraftJsonSchema, type Classification } from "./schemas";

type Candidate = Tables<"candidates">;
type Settings = Tables<"org_settings">;

/** The profile fields the model may see. No notes, no owner, no internal ids. */
export function candidateView(c: Candidate) {
  return {
    first_name: c.first_name, last_name: c.last_name, current_title: c.current_title, current_company: c.current_company,
    location: c.location, market_status: c.market_status, availability_date: c.availability_date,
    availability_precision: c.availability_precision, preferred_roles: c.preferred_roles, preferred_locations: c.preferred_locations,
    remote_preference: c.remote_preference, notice_period: c.notice_period, skills: c.skills.slice(0, 20), industry: c.industry,
  };
}

export type ThreadMsg = { direction: "INBOUND" | "OUTBOUND"; subject: string | null; text: string; at: string | null };

/** Last few messages, trimmed, oldest first — enough context, bounded cost. */
export async function loadThread(db: Db, conversationId: string, excludeMessageId?: string): Promise<ThreadMsg[]> {
  const { data } = await db.from("messages").select("id, direction, subject, text_body, reply_text, sent_at, received_at")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(7);
  return (data ?? []).filter((m) => m.id !== excludeMessageId).slice(0, 6).reverse().map((m) => ({
    direction: m.direction, subject: m.subject,
    text: ((m.direction === "INBOUND" ? m.reply_text || m.text_body : m.text_body) ?? "").slice(0, 1500),
    at: m.sent_at ?? m.received_at,
  }));
}

const today = () => new Date().toISOString().slice(0, 10);

export function classifyReply(db: Db, a: { settings: Settings; candidate: Candidate; thread: ThreadMsg[]; reply: string }) {
  return runStructured(db, {
    orgId: a.settings.org_id, candidateId: a.candidate.id, action: "classify", model: modelFor(a.settings, "classify"),
    promptName: "reply_classifier", schemaName: "reply_classification",
    schema: classificationSchema, jsonSchema: classificationJsonSchema,
    input: { today: today(), candidate: candidateView(a.candidate), memory: a.candidate.memory_summary, thread: a.thread, reply: a.reply.slice(0, 4000) },
  });
}

export function draftReply(db: Db, a: { settings: Settings; candidate: Candidate; thread: ThreadMsg[]; reply: string; subject: string; sender: { name: string; firm: string }; classification: Classification }) {
  const c = a.classification;
  return runStructured(db, {
    orgId: a.settings.org_id, candidateId: a.candidate.id, action: "reply", model: modelFor(a.settings, "reply"),
    promptName: "conversation_writer", schemaName: "email_draft",
    schema: emailDraftSchema, jsonSchema: emailDraftJsonSchema,
    input: {
      today: today(), sender: a.sender, candidate: candidateView(a.candidate), memory: c.memory || a.candidate.memory_summary,
      thread: a.thread, reply: a.reply.slice(0, 4000), original_subject: a.subject, goal: c.reply_goal,
      analysis: { intent: c.intent, market_status: c.market_status, availability: c.availability, reconnect_after: c.reconnect_after, summary: c.summary },
    },
  });
}

export function writeOutreach(db: Db, a: {
  settings: Settings; candidate: Candidate; purpose: "INITIAL" | "FOLLOW_UP" | "FINAL" | "NURTURE" | "RECONNECT";
  sender: { name: string; firm: string }; campaign: { objective: string | null; sector: string | null } | null; template: { subject: string; body: string };
}) {
  return runStructured(db, {
    orgId: a.settings.org_id, candidateId: a.candidate.id, action: "outreach", model: modelFor(a.settings, "outreach"),
    promptName: "outreach_writer", schemaName: "email_draft",
    schema: emailDraftSchema, jsonSchema: emailDraftJsonSchema,
    input: { today: today(), purpose: a.purpose, sender: a.sender, campaign: a.campaign, candidate: candidateView(a.candidate), memory: a.candidate.memory_summary, template: a.template },
  });
}
