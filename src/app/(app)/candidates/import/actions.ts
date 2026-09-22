"use server";

import { revalidatePath } from "next/cache";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { parseCsv } from "@/lib/import/parse";
import { analyzeImport, commitImport, type ImportAnalysis } from "@/lib/import/run";

const MAX_BYTES = 25 * 1024 * 1024;

export type AnalyzeState = {
  error?: string;
  key?: string;
  filename?: string;
  headers?: string[];
  mapping?: Record<string, string | null>;
  analysis?: ImportAnalysis;
};

export async function analyzeCsv(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > MAX_BYTES) return { error: "File is larger than 25 MB — split it" };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { error: "Only .csv files are supported" };

  const text = await file.text();
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0) return { error: "Could not read any columns from this file" };
  if (!Object.values(parsed.mapping).includes("email")) return { error: `No email column found. Columns seen: ${parsed.headers.join(", ")}` };

  // Keep the raw file server-side so the commit step re-reads it instead of trusting the browser.
  const key = `${s.orgId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const admin = adminClient();
  const { error: upErr } = await admin.storage.from("imports").upload(key, text, { contentType: "text/csv", upsert: false });
  if (upErr) return { error: `Could not stage file: ${upErr.message}` };

  const db = await createClient();
  const analysis = await analyzeImport(db, s.orgId, parsed.rows, { duplicateInFile: parsed.duplicateInFile, invalid: parsed.invalid.length });
  return { key, filename: file.name, headers: parsed.headers, mapping: parsed.mapping, analysis };
}

export type CommitState = {
  error?: string;
  result?: { created: number; updated: number; suppressed: number; duplicateInFile: number; invalid: number; errors: { line?: number; reason: string }[] };
};

export async function commitCsv(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const s = await getSession();
  if (!canWrite(s.role)) return { error: "Not allowed" };
  const key = String(formData.get("key") ?? "");
  const filename = String(formData.get("filename") ?? "import.csv");
  if (!key.startsWith(`${s.orgId}/`)) return { error: "Invalid import reference" };

  const admin = adminClient();
  const { data: blob, error: dlErr } = await admin.storage.from("imports").download(key);
  if (dlErr || !blob) return { error: "Staged file not found — upload it again" };
  const parsed = parseCsv(await blob.text());

  const db = await createClient();
  const result = await commitImport(db, s.orgId, s.userId, parsed.rows, {
    filename,
    duplicateInFile: parsed.duplicateInFile,
    invalid: parsed.invalid.map((i) => ({ line: i.line, reason: i.reason })),
  });

  await audit(admin, {
    orgId: s.orgId, eventType: "CANDIDATES_IMPORTED", actor: "USER", actorUserId: s.userId,
    decision: `created ${result.created}, updated ${result.updated}`,
    metadata: { filename, suppressed: result.suppressed, duplicateInFile: result.duplicateInFile, invalid: result.invalid },
  });
  await admin.storage.from("imports").remove([key]);
  revalidatePath("/candidates");
  return { result };
}
