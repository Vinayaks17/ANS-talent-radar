import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditInput = {
  orgId: string;
  candidateId?: string | null;
  eventType: string;
  actor: "SYSTEM" | "AI" | "USER";
  actorUserId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  inputRef?: string | null;
  outputRef?: string | null;
  decision?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

/** Every automated or human decision goes through here. Never throws. */
export async function audit(db: SupabaseClient, e: AuditInput) {
  const { error } = await db.from("audit_events").insert({
    org_id: e.orgId,
    candidate_id: e.candidateId ?? null,
    event_type: e.eventType,
    actor: e.actor,
    actor_user_id: e.actorUserId ?? null,
    model: e.model ?? null,
    prompt_version: e.promptVersion ?? null,
    input_ref: e.inputRef ?? null,
    output_ref: e.outputRef ?? null,
    decision: e.decision ?? null,
    reason: e.reason ?? null,
    metadata: e.metadata ?? {},
  });
  if (error) console.error("audit insert failed", error.message, e.eventType);
}
