"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { DEFAULT_STEPS } from "@/lib/campaigns/templates";
import { enroll, findEligible } from "@/lib/campaigns/enroll";

export async function createCampaign() {
  const s = await getSession();
  if (!canWrite(s.role)) redirect("/campaigns");
  const db = await createClient();
  const { data: senders } = await db.from("senders").select("id").eq("org_id", s.orgId).neq("status", "PAUSED");
  const { data: c, error } = await db
    .from("campaigns")
    .insert({ org_id: s.orgId, name: "New campaign", status: "DRAFT", created_by: s.userId, sender_ids: (senders ?? []).map((x) => x.id) })
    .select("id")
    .single();
  if (error || !c) throw new Error(error?.message ?? "create failed");
  await db.from("campaign_steps").insert(DEFAULT_STEPS.map((st) => ({ ...st, org_id: s.orgId, campaign_id: c.id })));
  await audit(adminClient(), { orgId: s.orgId, eventType: "CAMPAIGN_CREATED", actor: "USER", actorUserId: s.userId, metadata: { campaign_id: c.id } });
  redirect(`/campaigns/${c.id}`);
}

const campaignSchema = z.object({
  name: z.string().min(2).max(120),
  objective: z.string().max(300).nullable(),
  target_audience: z.string().max(300).nullable(),
  sector: z.string().max(120).nullable(),
  recontact_days: z.coerce.number().int().min(1).max(3650),
  daily_sender_limit: z.coerce.number().int().min(0).max(1000),
  sender_ids: z.array(z.string().uuid()),
  send_days: z.array(z.coerce.number().int().min(1).max(7)).nullable(),
  send_window_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  send_window_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export type CampaignState = { error?: string; saved?: boolean };

export async function saveCampaign(id: string, _prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const nz = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? v : null; };
  const inherit = formData.get("inherit_window") === "on";
  const parsed = campaignSchema.safeParse({
    name: formData.get("name"), objective: nz("objective"), target_audience: nz("target_audience"), sector: nz("sector"),
    recontact_days: formData.get("recontact_days"), daily_sender_limit: formData.get("daily_sender_limit"),
    sender_ids: formData.getAll("sender_ids").map(String),
    send_days: inherit ? null : formData.getAll("send_days"),
    send_window_start: inherit ? null : nz("send_window_start"),
    send_window_end: inherit ? null : nz("send_window_end"),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };

  const db = await createClient();
  const { error } = await db.from("campaigns").update(parsed.data).eq("id", id).eq("org_id", s.orgId);
  if (error) return { error: error.message };

  // Steps: arrays of parallel fields step_id[], delay_days[], template_subject[], template_body[], use_ai_<id>
  const ids = formData.getAll("step_id").map(String);
  const delays = formData.getAll("delay_days").map(Number);
  const subjects = formData.getAll("template_subject").map(String);
  const bodies = formData.getAll("template_body").map(String);
  for (let i = 0; i < ids.length; i++) {
    const { error: sErr } = await db.from("campaign_steps").update({
      delay_days: Number.isFinite(delays[i]) ? Math.max(0, delays[i]) : 0,
      template_subject: subjects[i] ?? null,
      template_body: bodies[i] ?? null,
      use_ai: formData.get(`use_ai_${ids[i]}`) === "on",
    }).eq("id", ids[i]).eq("campaign_id", id);
    if (sErr) return { error: sErr.message };
  }
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
  return { saved: true };
}

export async function setCampaignStatus(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED"): Promise<{ error?: string }> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const db = await createClient();
  if (status === "ACTIVE") {
    const { data: c } = await db.from("campaigns").select("sender_ids, name").eq("id", id).eq("org_id", s.orgId).single();
    if (!c || c.sender_ids.length === 0) return { error: "Pick at least one sender before activating" };
    if (!c.name || c.name === "New campaign") return { error: "Give the campaign a name first" };
  }
  const { error } = await db.from("campaigns").update({ status }).eq("id", id).eq("org_id", s.orgId);
  if (error) return { error: error.message };
  await audit(adminClient(), { orgId: s.orgId, eventType: "CAMPAIGN_STATUS", actor: "USER", actorUserId: s.userId, decision: status, metadata: { campaign_id: id } });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
  return {};
}

const enrollSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20000),
  marketStatuses: z.array(z.string()),
  industry: z.string().max(120).nullable(),
  locationContains: z.string().max(120).nullable(),
});

export type EnrollState = { error?: string; preview?: number; enrolled?: number; dailyCapacity?: number };

function readEnrollForm(formData: FormData) {
  const nz = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? v : null; };
  return enrollSchema.safeParse({
    limit: formData.get("limit") || 500,
    marketStatuses: formData.getAll("marketStatuses").map(String),
    industry: nz("industry"),
    locationContains: nz("locationContains"),
  });
}

export async function previewEnrollment(id: string, _prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const parsed = readEnrollForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await createClient();
  const { data: c } = await db.from("campaigns").select("id, recontact_days").eq("id", id).eq("org_id", s.orgId).single();
  if (!c) return { error: "Campaign not found" };
  const rows = await findEligible(db, s.orgId, c, parsed.data);
  return { preview: rows.length };
}

export async function enrollCandidates(id: string, _prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const parsed = readEnrollForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await createClient();
  const [{ data: c }, { data: settings }, { data: senders }] = await Promise.all([
    db.from("campaigns").select("id, status, recontact_days, daily_sender_limit, sender_ids, send_days, send_window_start, send_window_end").eq("id", id).eq("org_id", s.orgId).single(),
    db.from("org_settings").select("send_days, send_window_start, send_window_end, default_timezone, max_new_per_sender_per_day").eq("org_id", s.orgId).single(),
    db.from("senders").select("id, daily_cap_new").eq("org_id", s.orgId).neq("status", "PAUSED"),
  ]);
  if (!c || !settings) return { error: "Campaign not found" };
  if (c.status !== "ACTIVE") return { error: "Activate the campaign first — enrolment schedules real sends" };
  if (c.sender_ids.length === 0) return { error: "Pick at least one sender" };

  try {
    const r = await enroll(db, { orgId: s.orgId, userId: s.userId, campaign: c, settings, senders: senders ?? [], filters: parsed.data });
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/candidates");
    return { enrolled: r.enrolled, dailyCapacity: r.dailyCapacity };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Enrolment failed" };
  }
}
