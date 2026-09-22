"use server";

import { revalidatePath } from "next/cache";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { suppress } from "@/lib/policy/suppression";

export async function suppressCandidateById(candidateId: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const db = await createClient();
  const { data: c } = await db.from("candidates").select("email_normalized").eq("id", candidateId).eq("org_id", s.orgId).maybeSingle();
  if (!c) return { error: "Not found" };
  await suppress(db, { orgId: s.orgId, emailNormalized: c.email_normalized, candidateId, reason: "MANUAL", byUserId: s.userId, byLabel: "user:profile" });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/candidates");
  return {};
}

/** Schedules a RECONNECT send (step 4 template) at the next window — policy checks still run at send time. */
export async function reconnectNow(candidateId: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const db = await createClient();
  const { data: c } = await db.from("candidates").select("id, communication_status").eq("id", candidateId).eq("org_id", s.orgId).maybeSingle();
  if (!c) return { error: "Not found" };
  if (c.communication_status === "SUPPRESSED") return { error: "Candidate is suppressed" };
  const { data: enr } = await db.from("campaign_enrollments").select("campaign_id").eq("candidate_id", candidateId).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
  if (!enr) return { error: "Candidate has never been enrolled in a campaign — enrol first" };
  const { data: nurture } = await db.from("campaign_steps").select("step_number").eq("campaign_id", enr.campaign_id).eq("message_type", "NURTURE").maybeSingle();
  await db.from("scheduled_actions").update({ status: "CANCELLED", last_error: "replaced by manual reconnect" }).eq("candidate_id", candidateId).eq("status", "PENDING");
  const { error } = await db.from("scheduled_actions").insert({
    org_id: s.orgId, candidate_id: candidateId, campaign_id: enr.campaign_id, action_type: "RECONNECT",
    payload: { step_number: nurture?.step_number ?? 4 }, scheduled_for: new Date().toISOString(), status: "PENDING", created_by_label: "user:reconnect",
  });
  if (error) return { error: error.message };
  await audit(adminClient(), { orgId: s.orgId, candidateId, eventType: "RECONNECT_REQUESTED", actor: "USER", actorUserId: s.userId });
  revalidatePath(`/candidates/${candidateId}`);
  return {};
}
