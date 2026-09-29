"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { AiUnavailable } from "@/lib/ai/client";
import { runMatching } from "@/lib/matching/match";

export type ReqState = { error?: string; ok?: boolean; message?: string };

async function requireMatching() {
  const s = await getSession();
  const db = await createClient();
  const { data } = await db.from("org_settings").select("matching_enabled").eq("org_id", s.orgId).single();
  if (!data?.matching_enabled) redirect("/");
  return { s, db };
}

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

const reqSchema = z.object({
  title: z.string().trim().min(2, "Give the role a title").max(160),
  client_name: z.string().trim().max(160).nullable(),
  location: z.string().trim().max(160).nullable(),
  remote_policy: z.enum(["onsite", "hybrid", "remote"]).nullable(),
  comp_min: z.number().int().nullable(),
  comp_max: z.number().int().nullable(),
  currency: z.string().trim().length(3),
  must_have: z.array(z.string().max(120)),
  nice_to_have: z.array(z.string().max(120)),
  description: z.string().trim().max(6000).nullable(),
});

function parseForm(fd: FormData) {
  const t = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
  return reqSchema.safeParse({
    title: String(fd.get("title") ?? ""), client_name: t("client_name"), location: t("location"),
    remote_policy: t("remote_policy"), comp_min: num(fd.get("comp_min")), comp_max: num(fd.get("comp_max")),
    currency: (t("currency") ?? "USD").toUpperCase(), must_have: list(fd.get("must_have")), nice_to_have: list(fd.get("nice_to_have")),
    description: t("description"),
  });
}

export async function createRequirement(_p: ReqState, fd: FormData): Promise<ReqState> {
  const { s, db } = await requireMatching();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const parsed = parseForm(fd);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.comp_min && parsed.data.comp_max && parsed.data.comp_min > parsed.data.comp_max) return { error: "Minimum pay is above maximum" };
  const { data, error } = await db.from("requirements").insert({ ...parsed.data, org_id: s.orgId, created_by: s.userId }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Could not save" };
  await audit(adminClient(), { orgId: s.orgId, eventType: "REQUIREMENT_CREATED", actor: "USER", actorUserId: s.userId, inputRef: data.id, reason: parsed.data.title });
  redirect(`/requirements/${data.id}`);
}

export async function findMatches(_p: ReqState, fd: FormData): Promise<ReqState> {
  const { s, db } = await requireMatching();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const id = String(fd.get("requirementId") ?? "");
  const { data: req } = await db.from("requirements").select("id").eq("id", id).eq("org_id", s.orgId).maybeSingle();
  if (!req) return { error: "Requirement not found" };
  try {
    // Service role after the membership check above: the run writes ai_usage and audit rows.
    const r = await runMatching(adminClient(), { orgId: s.orgId, requirementId: id, userId: s.userId });
    revalidatePath(`/requirements/${id}`);
    return { ok: true, message: r.scored ? `Scored ${r.scored} candidates (${r.model}, $${r.costUsd.toFixed(3)}).` : "No contactable candidates matched this requirement yet." };
  } catch (e) {
    if (e instanceof AiUnavailable) return { error: `AI is not available: ${e.message}` };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setMatchStatus(matchId: string, status: "SUGGESTED" | "SHORTLISTED" | "REJECTED"): Promise<{ error?: string }> {
  const { s, db } = await requireMatching();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const { data, error } = await db.from("requirement_matches").update({ status, decided_by: s.userId }).eq("id", matchId).eq("org_id", s.orgId).select("requirement_id, candidate_id").single();
  if (error || !data) return { error: error?.message ?? "Match not found" };
  await audit(adminClient(), { orgId: s.orgId, candidateId: data.candidate_id, eventType: "MATCH_DECIDED", actor: "USER", actorUserId: s.userId, decision: status, inputRef: data.requirement_id });
  revalidatePath(`/requirements/${data.requirement_id}`);
  return {};
}

export async function setRequirementStatus(id: string, status: "OPEN" | "ON_HOLD" | "CLOSED"): Promise<{ error?: string }> {
  const { s, db } = await requireMatching();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const { error } = await db.from("requirements").update({ status }).eq("id", id).eq("org_id", s.orgId);
  if (error) return { error: error.message };
  revalidatePath("/requirements");
  revalidatePath(`/requirements/${id}`);
  return {};
}
