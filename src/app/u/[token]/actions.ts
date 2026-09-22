"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { suppress } from "@/lib/policy/suppression";

export async function unsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "").replace(/[^a-z0-9]/gi, "");
  if (token) await suppressByToken(token);
  redirect(`/u/${token}?done=1`);
}

export async function suppressByToken(token: string) {
  const db = adminClient();
  const { data: conv } = await db.from("conversations").select("org_id, candidate_id").eq("thread_token", token).maybeSingle();
  if (!conv) return false;
  const { data: cand } = await db.from("candidates").select("email_normalized").eq("id", conv.candidate_id).single();
  if (!cand) return false;
  await suppress(db, { orgId: conv.org_id, emailNormalized: cand.email_normalized, candidateId: conv.candidate_id, reason: "OPT_OUT", byLabel: "unsubscribe-link" });
  return true;
}
