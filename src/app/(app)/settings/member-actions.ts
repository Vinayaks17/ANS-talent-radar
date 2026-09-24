"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export type MemberState = { error?: string; ok?: boolean; tempPassword?: string; email?: string };
const ROLES = ["admin", "recruiter", "viewer"] as const;

/** Readable one-time password: 4 groups of 4, no ambiguous characters. */
function tempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

/**
 * Admin adds a person by email (any domain). If they have no account yet one
 * is created with a one-time password shown to the admin once; they change
 * it under Settings → Your account. Supabase's built-in mailer is not used
 * (it only delivers to project team members without custom SMTP).
 */
export async function addMember(_p: MemberState, fd: FormData): Promise<MemberState> {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can add members" };
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES), display_name: z.string().trim().max(80).optional() })
    .safeParse({ email: fd.get("email"), role: fd.get("role"), display_name: fd.get("display_name") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { email, role } = parsed.data;
  const admin = adminClient();

  let userId: string | null = (await admin.rpc("find_user_id_by_email", { p_email: email })).data ?? null;
  let password: string | undefined;
  if (!userId) {
    password = tempPassword();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return { error: `Could not create the account: ${error?.message ?? "unknown"}` };
    userId = data.user.id;
  }

  const { data: existing } = await admin.from("org_members").select("role").eq("org_id", s.orgId).eq("user_id", userId).maybeSingle();
  if (existing) return { error: `${email} is already a member (${existing.role})` };

  const { error } = await admin.from("org_members").insert({ org_id: s.orgId, user_id: userId, role, display_name: parsed.data.display_name ?? email.split("@")[0] });
  if (error) return { error: error.message };
  await audit(admin, { orgId: s.orgId, eventType: "MEMBER_ADDED", actor: "USER", actorUserId: s.userId, decision: role, reason: email, metadata: { new_account: !!password } });
  revalidatePath("/settings");
  return { ok: true, tempPassword: password, email };
}

export async function setMemberRole(userId: string, role: (typeof ROLES)[number]): Promise<{ error?: string }> {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can change roles" };
  if (!ROLES.includes(role)) return { error: "Unknown role" };
  if (userId === s.userId) return { error: "You cannot change your own role" };
  const db = await createClient();
  const { error } = await db.from("org_members").update({ role }).eq("org_id", s.orgId).eq("user_id", userId);
  if (error) return { error: error.message };
  await audit(adminClient(), { orgId: s.orgId, eventType: "MEMBER_ROLE_CHANGED", actor: "USER", actorUserId: s.userId, decision: role, metadata: { user_id: userId } });
  revalidatePath("/settings");
  return {};
}

export async function removeMember(userId: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (s.role !== "admin") return { error: "Only admins can remove members" };
  if (userId === s.userId) return { error: "You cannot remove yourself" };
  const db = await createClient();
  const { error } = await db.from("org_members").delete().eq("org_id", s.orgId).eq("user_id", userId);
  if (error) return { error: error.message };
  await audit(adminClient(), { orgId: s.orgId, eventType: "MEMBER_REMOVED", actor: "USER", actorUserId: s.userId, metadata: { user_id: userId } });
  revalidatePath("/settings");
  return {};
}

export async function changePassword(_p: MemberState, fd: FormData): Promise<MemberState> {
  await getSession();
  const parsed = z.object({ password: z.string().min(10, "Use at least 10 characters").max(72), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords do not match" })
    .safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const db = await createClient();
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: true };
}
