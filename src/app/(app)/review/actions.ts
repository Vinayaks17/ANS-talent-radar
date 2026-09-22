"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { suppress } from "@/lib/policy/suppression";
import type { Database } from "@/lib/database.types";

export type ReviewState = { error?: string; ok?: boolean };

async function loadItem(itemId: string, orgId: string) {
  const db = await createClient();
  const { data } = await db.from("review_items").select("*").eq("id", itemId).eq("org_id", orgId).eq("status", "OPEN").maybeSingle();
  return { db, item: data };
}

export async function approveReply(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const parsed = z.object({ itemId: z.string().uuid(), conversationId: z.string().uuid(), subject: z.string().min(1).max(200), text: z.string().min(2).max(5000) })
    .safeParse({ itemId: fd.get("itemId"), conversationId: fd.get("conversationId"), subject: fd.get("subject"), text: fd.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { db, item } = await loadItem(parsed.data.itemId, s.orgId);
  if (!item) return { error: "Item already handled" };

  const { error } = await db.from("scheduled_actions").insert({
    org_id: s.orgId, candidate_id: item.candidate_id, conversation_id: parsed.data.conversationId, campaign_id: null,
    action_type: "SEND_REPLY", payload: { subject: parsed.data.subject, text: parsed.data.text, review_item_id: item.id },
    scheduled_for: new Date().toISOString(), status: "PENDING", created_by_label: "review:approve",
  });
  if (error) return { error: error.message };
  await db.from("review_items").update({ status: "APPROVED", resolved_by: s.userId, resolved_at: new Date().toISOString(), draft_reply: parsed.data.text }).eq("id", item.id);
  await db.from("candidates").update({ communication_status: "CONVERSATION_ACTIVE" }).eq("id", item.candidate_id);
  await audit(adminClient(), { orgId: s.orgId, candidateId: item.candidate_id, eventType: "REPLY_APPROVED", actor: "USER", actorUserId: s.userId, decision: "SEND_REPLY", metadata: { review_item_id: item.id } });
  revalidatePath("/review");
  return { ok: true };
}

export async function skipItem(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const itemId = String(fd.get("itemId") ?? "");
  const { db, item } = await loadItem(itemId, s.orgId);
  if (!item) return { error: "Item already handled" };
  await db.from("review_items").update({ status: "SKIPPED", resolved_by: s.userId, resolved_at: new Date().toISOString() }).eq("id", item.id);
  await db.from("candidates").update({ communication_status: "CLOSED" }).eq("id", item.candidate_id).eq("communication_status", "HUMAN_REVIEW");
  await audit(adminClient(), { orgId: s.orgId, candidateId: item.candidate_id, eventType: "REVIEW_SKIPPED", actor: "USER", actorUserId: s.userId, metadata: { review_item_id: item.id } });
  revalidatePath("/review");
  return { ok: true };
}

export async function suppressCandidate(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const itemId = String(fd.get("itemId") ?? "");
  const { db, item } = await loadItem(itemId, s.orgId);
  if (!item) return { error: "Item already handled" };
  const { data: cand } = await db.from("candidates").select("email_normalized").eq("id", item.candidate_id).single();
  if (!cand) return { error: "Candidate not found" };
  await suppress(db, { orgId: s.orgId, emailNormalized: cand.email_normalized, candidateId: item.candidate_id, reason: "MANUAL", byUserId: s.userId, byLabel: "user:review" });
  await db.from("review_items").update({ status: "SUPPRESSED", resolved_by: s.userId, resolved_at: new Date().toISOString() }).eq("id", item.id);
  revalidatePath("/review");
  revalidatePath("/candidates");
  return { ok: true };
}

const MARKET = ["AVAILABLE_NOW", "OPEN_TO_RIGHT_OPPORTUNITY", "OPEN_LATER", "PASSIVE", "NOT_LOOKING", "NOT_INTERESTED", "UNKNOWN"] as const;

export async function setMarketStatus(_p: ReviewState, fd: FormData): Promise<ReviewState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const parsed = z.object({ candidateId: z.string().uuid(), market_status: z.enum(MARKET), availability: z.string().regex(/^\d{4}-\d{2}$/).optional().or(z.literal("")) })
    .safeParse({ candidateId: fd.get("candidateId"), market_status: fd.get("market_status"), availability: fd.get("availability") ?? "" });
  if (!parsed.success) return { error: "Pick a status (availability must look like 2027-03)" };
  const db = await createClient();
  const patch: Database["public"]["Tables"]["candidates"]["Update"] = { market_status: parsed.data.market_status, last_verified_at: new Date().toISOString() };
  if (parsed.data.availability) { patch.availability_date = `${parsed.data.availability}-01`; patch.availability_precision = "MONTH"; }
  const { error } = await db.from("candidates").update(patch).eq("id", parsed.data.candidateId).eq("org_id", s.orgId);
  if (error) return { error: error.message };
  await db.from("candidate_facts").insert({ org_id: s.orgId, candidate_id: parsed.data.candidateId, fact_type: "MARKET_STATUS", value_json: { status: parsed.data.market_status, availability: parsed.data.availability || null }, source: "USER", confidence: 1, created_by: s.userId });
  await audit(adminClient(), { orgId: s.orgId, candidateId: parsed.data.candidateId, eventType: "MARKET_STATUS_SET", actor: "USER", actorUserId: s.userId, decision: parsed.data.market_status });
  revalidatePath("/review");
  revalidatePath(`/candidates/${parsed.data.candidateId}`);
  return { ok: true };
}
