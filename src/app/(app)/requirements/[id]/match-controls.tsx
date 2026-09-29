"use client";

import { useActionState, useTransition, useState } from "react";
import { findMatches, setMatchStatus, setRequirementStatus, type ReqState } from "../actions";
import { Button } from "@/components/ui/button";

export function FindMatchesButton({ requirementId, hasRun }: { requirementId: string; hasRun: boolean }) {
  const [state, action, pending] = useActionState<ReqState, FormData>(findMatches, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      {state.error && <span className="text-xs text-red-700 max-w-[280px] truncate" title={state.error}>{state.error}</span>}
      {state.message && !pending && <span className="text-xs text-green-800">{state.message}</span>}
      <Button type="submit" disabled={pending}>{pending ? "Scoring candidates… (up to a minute)" : hasRun ? "Re-run matching" : "Find matches"}</Button>
    </form>
  );
}

export function MatchControls({ matchId, status }: { matchId: string; status: string }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const set = (s: "SUGGESTED" | "SHORTLISTED" | "REJECTED") => start(async () => { const r = await setMatchStatus(matchId, s); setErr(r.error ?? null); });
  return (
    <div className="flex flex-col gap-1.5 items-end">
      <div className="flex gap-1.5">
        {status !== "SHORTLISTED" && <Button size="sm" disabled={busy} onClick={() => set("SHORTLISTED")}>Shortlist</Button>}
        {status !== "REJECTED" && <Button size="sm" variant="outline" disabled={busy} onClick={() => set("REJECTED")}>Reject</Button>}
        {status !== "SUGGESTED" && <Button size="sm" variant="outline" disabled={busy} onClick={() => set("SUGGESTED")}>Undo</Button>}
      </div>
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </div>
  );
}

export function RequirementStatus({ id, status }: { id: string; status: string }) {
  const [busy, start] = useTransition();
  return (
    <select defaultValue={status} disabled={busy} aria-label="Requirement status" className="border rounded-md px-2 h-9 bg-white text-sm"
      onChange={(e) => start(async () => { await setRequirementStatus(id, e.target.value as "OPEN" | "ON_HOLD" | "CLOSED"); })}>
      <option value="OPEN">Open</option><option value="ON_HOLD">On hold</option><option value="CLOSED">Closed</option>
    </select>
  );
}
