import "server-only";
import OpenAI from "openai";
import type { z } from "zod";
import type { Db, Tables } from "@/lib/db";
import { env } from "@/lib/env";
import { costUsd } from "./pricing";

/** Which org_settings.models key an action uses. */
export type AiAction = "classify" | "reply" | "outreach" | "memory" | "resume" | "match";

let client: OpenAI | null = null;
function openai() {
  const key = env().OPENAI_API_KEY;
  if (!key) throw new AiUnavailable("OPENAI_API_KEY not set");
  if (!client) client = new OpenAI({ apiKey: key, timeout: 60_000, maxRetries: 2 });
  return client;
}

/** Thrown when AI must not or cannot run; callers fall back to the human path. */
export class AiUnavailable extends Error {}

export function modelFor(settings: Pick<Tables<"org_settings">, "models">, action: AiAction) {
  const models = (settings.models ?? {}) as Record<string, string>;
  return models[action] ?? "gpt-5.6-luna";
}

/** Kill switch + monthly budget. Cheap: one aggregate over this month's usage rows. */
export async function assertAiAvailable(db: Db, settings: Pick<Tables<"org_settings">, "org_id" | "ai_enabled" | "ai_monthly_budget_usd">) {
  if (!env().OPENAI_API_KEY) throw new AiUnavailable("OPENAI_API_KEY not set");
  if (!settings.ai_enabled) throw new AiUnavailable("AI disabled in settings");
  const spent = await monthSpend(db, settings.org_id);
  if (spent >= Number(settings.ai_monthly_budget_usd)) throw new AiUnavailable(`monthly AI budget reached ($${spent.toFixed(2)})`);
}

export async function monthSpend(db: Db, orgId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from("ai_usage").select("cost_usd").eq("org_id", orgId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

/** Active prompt: the org's own highest version, else the global default. */
export async function loadPrompt(db: Db, orgId: string, name: string) {
  const { data } = await db.from("prompt_templates").select("org_id, version, content")
    .eq("name", name).eq("active", true).or(`org_id.eq.${orgId},org_id.is.null`)
    .order("version", { ascending: false });
  const row = (data ?? []).find((r) => r.org_id === orgId) ?? (data ?? []).find((r) => r.org_id === null);
  if (!row) throw new AiUnavailable(`prompt ${name} missing`);
  return { content: row.content.trim(), version: `${name}@v${row.version}${row.org_id ? "-org" : ""}` };
}

export type StructuredResult<T> = { data: T; model: string; promptVersion: string; costUsd: number; usage: { input: number; cached: number; output: number } };

/**
 * One structured call: load prompt → Responses API (strict JSON schema) →
 * zod-validate → log tokens and cost to ai_usage. Throws on invalid output.
 */
export async function runStructured<S extends z.ZodTypeAny>(db: Db, args: {
  orgId: string; candidateId: string | null; action: AiAction; model: string; promptName: string;
  input: unknown; schema: S; jsonSchema: Record<string, unknown>; schemaName: string;
}): Promise<StructuredResult<z.infer<S>>> {
  const prompt = await loadPrompt(db, args.orgId, args.promptName);
  const res = await openai().responses.create({
    model: args.model,
    instructions: prompt.content,
    input: JSON.stringify(args.input),
    reasoning: { effort: "low" },
    store: false,
    text: { format: { type: "json_schema", name: args.schemaName, strict: true, schema: args.jsonSchema } },
  });

  const usage = {
    input: res.usage?.input_tokens ?? 0,
    cached: res.usage?.input_tokens_details?.cached_tokens ?? 0,
    output: res.usage?.output_tokens ?? 0,
  };
  const cost = costUsd(args.model, usage);
  const { error: usageErr } = await db.from("ai_usage").insert({
    org_id: args.orgId, candidate_id: args.candidateId, action: args.action, model: args.model,
    input_tokens: usage.input, output_tokens: usage.output, cached_tokens: usage.cached, cost_usd: Number(cost.toFixed(6)),
  });
  if (usageErr) console.error("ai_usage insert failed", usageErr.message);

  let raw: unknown;
  try { raw = JSON.parse(res.output_text); } catch { throw new Error(`${args.promptName}: model returned non-JSON`); }
  const parsed = args.schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${args.promptName}: output failed validation — ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
  return { data: parsed.data, model: args.model, promptVersion: prompt.version, costUsd: cost, usage };
}
