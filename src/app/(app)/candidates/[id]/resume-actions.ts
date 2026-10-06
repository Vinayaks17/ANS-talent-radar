"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { AiUnavailable } from "@/lib/ai/client";
import { extractResumeText, resumeKind, RESUME_MAX_BYTES } from "@/lib/resume/extract";
import { parseResumeIntoCandidate } from "@/lib/resume/parse";
import { refreshReadiness } from "@/lib/matching/readiness";

export type ResumeState = { error?: string; ok?: boolean; message?: string };

export async function uploadResume(_p: ResumeState, fd: FormData): Promise<ResumeState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const candidateId = String(fd.get("candidateId") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or Word (.docx) file" };
  if (file.size > RESUME_MAX_BYTES) return { error: "File is over 4 MB" };
  const kind = resumeKind(file);
  if (!kind) return { error: "Only PDF or Word (.docx) resumes are supported" };

  const db = await createClient();
  const { data: cand } = await db.from("candidates").select("*").eq("id", candidateId).eq("org_id", s.orgId).maybeSingle();
  if (!cand) return { error: "Candidate not found" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  // pdf.js detaches the buffer it reads, so it gets a copy; the original is uploaded below.
  try { text = await extractResumeText(bytes.slice(), kind); } catch { return { error: "Couldn't read that file — is it password-protected or a scanned image?" }; }
  if (text.length < 200) return { error: "Hardly any text in that file — scanned resumes (images) aren't supported yet" };

  // Service role from here, after the membership check: storage and ai_usage writes.
  const admin = adminClient();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80);
  const path = `${s.orgId}/${cand.id}/${Date.now()}-${randomBytes(3).toString("hex")}-${safeName}`;
  const { error: upErr } = await admin.storage.from("resumes").upload(path, bytes, { contentType: file.type || (kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") });
  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  try {
    const r = await parseResumeIntoCandidate(admin, { candidate: cand, text, file: { path, filename: file.name, size: file.size }, userId: s.userId });
    if (!r.ok) { await admin.storage.from("resumes").remove([path]); return { error: r.reason }; }
    await refreshReadiness(admin, { candidateIds: [cand.id] }).catch(() => undefined);
    await audit(admin, { orgId: s.orgId, candidateId: cand.id, eventType: "RESUME_PARSED", actor: "AI", actorUserId: s.userId, model: r.model, promptVersion: r.promptVersion, inputRef: path, decision: `${r.data.skills.length} skills`, reason: r.fields.length ? `filled: ${r.fields.join(", ")}` : "no blank fields to fill", metadata: { cost_usd: Number(r.costUsd.toFixed(6)) } });
    revalidatePath(`/candidates/${cand.id}`);
    return { ok: true, message: `Resume read: ${r.data.skills.length} skills${r.data.total_years_experience != null ? `, ${r.data.total_years_experience} yrs experience` : ""}${r.fields.length ? ` · filled ${r.fields.join(", ").replace(/_/g, " ")}` : ""}.` };
  } catch (e) {
    if (e instanceof AiUnavailable) return { error: `Saved the file, but the AI is unavailable (${e.message}).` };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Short-lived download link for a stored resume (checks the file belongs to the caller's org). */
export async function resumeLink(path: string): Promise<{ url?: string; error?: string }> {
  const s = await getSession();
  if (!path.startsWith(`${s.orgId}/`)) return { error: "Not allowed" };
  const { data, error } = await adminClient().storage.from("resumes").createSignedUrl(path, 300);
  return error || !data ? { error: error?.message ?? "Not found" } : { url: data.signedUrl };
}
