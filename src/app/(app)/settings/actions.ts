"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export async function setOutreachPaused(paused: boolean): Promise<{ error?: string }> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({ outreach_paused: paused, paused_by: paused ? s.userId : null, paused_at: paused ? new Date().toISOString() : null })
    .eq("org_id", s.orgId);
  if (error) return { error: error.message };
  await audit(adminClient(), {
    orgId: s.orgId,
    eventType: paused ? "OUTREACH_PAUSED" : "OUTREACH_RESUMED",
    actor: "USER",
    actorUserId: s.userId,
    decision: paused ? "PAUSE_ALL" : "RESUME",
    reason: "Manual emergency control",
  });
  revalidatePath("/", "layout");
  return {};
}

const settingsSchema = z.object({
  max_outreach_per_day: z.coerce.number().int().min(0).max(100000),
  max_new_per_sender_per_day: z.coerce.number().int().min(0).max(10000),
  max_followups_per_sender_per_day: z.coerce.number().int().min(0).max(10000),
  min_gap_hours: z.coerce.number().int().min(0).max(24 * 365),
  max_unanswered_per_sequence: z.coerce.number().int().min(1).max(20),
  default_nurture_days: z.coerce.number().int().min(1).max(3650),
  send_days: z.array(z.coerce.number().int().min(1).max(7)).min(1),
  send_window_start: z.string().regex(/^\d{2}:\d{2}$/),
  send_window_end: z.string().regex(/^\d{2}:\d{2}$/),
  default_timezone: z.string().min(1),
  auto_threshold: z.coerce.number().min(0).max(1),
  review_threshold: z.coerce.number().min(0).max(1),
  approval_required: z.boolean(),
  human_review_categories: z.array(z.string()),
  models: z.record(z.string(), z.string()),
});

export type SettingsState = { error?: string; saved?: boolean };

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can change settings" };

  const raw = {
    max_outreach_per_day: formData.get("max_outreach_per_day"),
    max_new_per_sender_per_day: formData.get("max_new_per_sender_per_day"),
    max_followups_per_sender_per_day: formData.get("max_followups_per_sender_per_day"),
    min_gap_hours: formData.get("min_gap_hours"),
    max_unanswered_per_sequence: formData.get("max_unanswered_per_sequence"),
    default_nurture_days: formData.get("default_nurture_days"),
    send_days: formData.getAll("send_days"),
    send_window_start: formData.get("send_window_start"),
    send_window_end: formData.get("send_window_end"),
    default_timezone: formData.get("default_timezone"),
    auto_threshold: formData.get("auto_threshold"),
    review_threshold: formData.get("review_threshold"),
    approval_required: formData.get("approval_required") === "on",
    human_review_categories: formData.getAll("human_review_categories").map(String),
    models: Object.fromEntries(
      ["outreach", "classify", "reply", "memory", "resume", "match"].map((k) => [k, String(formData.get(`model_${k}`) ?? "gpt-5.6-luna")]),
    ),
  };
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (parsed.data.review_threshold > parsed.data.auto_threshold) return { error: "Review threshold must be below the automatic threshold" };

  const supabase = await createClient();
  const { error } = await supabase.from("org_settings").update(parsed.data).eq("org_id", s.orgId);
  if (error) return { error: error.message };
  await audit(adminClient(), { orgId: s.orgId, eventType: "SETTINGS_UPDATED", actor: "USER", actorUserId: s.userId, metadata: parsed.data });
  revalidatePath("/settings");
  return { saved: true };
}

const senderSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(80),
  daily_cap_new: z.coerce.number().int().min(0).max(1000),
  daily_cap_followup: z.coerce.number().int().min(0).max(1000),
});

export async function addSender(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can add senders" };
  const parsed = senderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.from("senders").insert({ org_id: s.orgId, ...parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}

export async function setSenderStatus(senderId: string, status: "WARMING" | "WARMED" | "PAUSED") {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can change senders" };
  const supabase = await createClient();
  const { error } = await supabase.from("senders").update({ status }).eq("id", senderId).eq("org_id", s.orgId);
  revalidatePath("/settings");
  return { error: error?.message };
}
