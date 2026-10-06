import "server-only";
import { z } from "zod";
import type { Db, Tables } from "@/lib/db";
import type { Database, Json } from "@/lib/database.types";
import { runStructured, modelFor, assertAiAvailable } from "@/lib/ai/client";

const nullableStr = z.string().max(300).nullable();
export const resumeSchema = z.object({
  is_resume: z.boolean(),
  current_title: nullableStr,
  current_company: nullableStr,
  location: nullableStr,
  total_years_experience: z.number().min(0).max(60).nullable(),
  seniority: z.enum(["ENTRY", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR", "EXECUTIVE"]).nullable(),
  industries: z.array(z.string().max(80)).max(8),
  skills: z.array(z.string().max(60)).max(40),
  roles: z.array(z.object({ title: z.string().max(160), company: z.string().max(160), start: nullableStr, end: nullableStr })).max(10),
  education: z.array(z.string().max(200)).max(6),
  certifications: z.array(z.string().max(160)).max(10),
  languages: z.array(z.string().max(40)).max(8),
  summary: z.string().max(800),
});
export type ResumeData = z.infer<typeof resumeSchema>;

const s = { type: "string" } as const;
const ns = { type: ["string", "null"] } as const;
const arr = (items: unknown) => ({ type: "array", items });
const resumeJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["is_resume", "current_title", "current_company", "location", "total_years_experience", "seniority", "industries", "skills", "roles", "education", "certifications", "languages", "summary"],
  properties: {
    is_resume: { type: "boolean" }, current_title: ns, current_company: ns, location: ns,
    total_years_experience: { type: ["number", "null"] },
    seniority: { anyOf: [{ type: "string", enum: ["ENTRY", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR", "EXECUTIVE"] }, { type: "null" }] },
    industries: arr(s), skills: arr(s),
    roles: arr({ type: "object", additionalProperties: false, required: ["title", "company", "start", "end"], properties: { title: s, company: s, start: ns, end: ns } }),
    education: arr(s), certifications: arr(s), languages: arr(s), summary: s,
  },
};

type CandidateUpdate = Database["public"]["Tables"]["candidates"]["Update"];

/**
 * Resume → structured profile (Luna by default, models.resume). Fills blanks
 * on the candidate, merges skills, and stores every extracted item as a fact
 * with source RESUME so recruiters can see where it came from. What the
 * candidate told us by email always wins over the resume.
 */
export async function parseResumeIntoCandidate(db: Db, a: { candidate: Tables<"candidates">; text: string; file: { path: string; filename: string; size: number }; userId: string | null }) {
  const { data: settings } = await db.from("org_settings").select("*").eq("org_id", a.candidate.org_id).single();
  if (!settings) throw new Error("settings missing");
  await assertAiAvailable(db, settings);
  const r = await runStructured(db, {
    orgId: a.candidate.org_id, candidateId: a.candidate.id, action: "resume", model: modelFor(settings, "resume"),
    promptName: "resume_parser", schemaName: "resume", schema: resumeSchema, jsonSchema: resumeJsonSchema,
    input: { resume_text: a.text },
  });
  const d = r.data;
  if (!d.is_resume) return { ok: false as const, reason: "That file doesn't look like a resume.", model: r.model };

  const c = a.candidate;
  const patch: CandidateUpdate = {};
  if (!c.current_title && d.current_title) patch.current_title = d.current_title;
  if (!c.current_company && d.current_company) patch.current_company = d.current_company;
  if (!c.location && d.location) patch.location = d.location;
  if (!c.industry && d.industries[0]) patch.industry = d.industries[0];
  const skills = [...new Set([...c.skills, ...d.skills.map((x) => x.trim()).filter(Boolean)])].slice(0, 60);
  if (skills.length !== c.skills.length) patch.skills = skills;
  if (!c.memory_summary && d.summary) patch.memory_summary = `From resume: ${d.summary}`;
  if (Object.keys(patch).length) await db.from("candidates").update(patch).eq("id", c.id);

  const now = new Date().toISOString();
  const fact = (fact_type: string, value_json: Record<string, unknown>) => ({
    org_id: c.org_id, candidate_id: c.id, fact_type, source: "RESUME" as const, confidence: 0.9, reported_at: now, created_by: a.userId, value_json: value_json as Json,
  });
  const facts = [
    fact("RESUME_FILE", { value: a.file.filename, path: a.file.path, size: a.file.size, model: r.model }),
    ...(d.current_title ? [fact("CURRENT_TITLE", { value: d.current_title })] : []),
    ...(d.current_company ? [fact("CURRENT_EMPLOYER", { value: d.current_company })] : []),
    ...(d.total_years_experience != null ? [fact("EXPERIENCE_YEARS", { value: `${d.total_years_experience} years`, years: d.total_years_experience, seniority: d.seniority })] : []),
    ...(d.skills.length ? [fact("SKILLS", { value: d.skills.slice(0, 15).join(", "), items: d.skills })] : []),
    ...(d.roles.length ? [fact("WORK_HISTORY", { value: d.roles.slice(0, 4).map((x) => `${x.title} @ ${x.company}${x.start ? ` (${x.start}–${x.end ?? "now"})` : ""}`).join("; "), items: d.roles })] : []),
    ...(d.education.length ? [fact("EDUCATION", { value: d.education.join("; ") })] : []),
    ...(d.certifications.length ? [fact("CERTIFICATIONS", { value: d.certifications.join("; ") })] : []),
  ];
  await db.from("candidate_facts").insert(facts);
  return { ok: true as const, data: d, fields: Object.keys(patch), model: r.model, promptVersion: r.promptVersion, costUsd: r.costUsd };
}
