"use client";

import { useActionState, useState } from "react";
import { approveReply, skipItem, suppressCandidate, setMarketStatus, type ReviewState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MARKETS: [string, string][] = [["AVAILABLE_NOW", "Available now"], ["OPEN_TO_RIGHT_OPPORTUNITY", "Open to right role"], ["OPEN_LATER", "Open later"], ["PASSIVE", "Passive"], ["NOT_LOOKING", "Not looking"], ["NOT_INTERESTED", "Not interested"]];

export function ReviewActions({ itemId, candidateId, conversationId, draft, subject, aiDraft, reconnectAt }: { itemId: string; candidateId: string; conversationId: string | null; draft: string; subject: string; aiDraft: boolean; reconnectAt: string }) {
  const [a, approve, approving] = useActionState<ReviewState, FormData>(approveReply, {});
  const [k, skip, skipping] = useActionState<ReviewState, FormData>(skipItem, {});
  const [sp, suppressA, suppressing] = useActionState<ReviewState, FormData>(suppressCandidate, {});
  const [m, market, marking] = useActionState<ReviewState, FormData>(setMarketStatus, {});
  const [confirmSuppress, setConfirmSuppress] = useState(false);
  const err = a.error ?? k.error ?? sp.error ?? m.error;

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <form action={market} className="flex items-center gap-2 text-xs">
        <input type="hidden" name="candidateId" value={candidateId} />
        <label htmlFor="ms" className="text-muted-foreground">Set market status</label>
        <select id="ms" name="market_status" className="border rounded-md px-2 py-1 bg-white text-xs" defaultValue="">
          <option value="" disabled>Choose…</option>
          {MARKETS.map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}
        </select>
        <Input name="availability" placeholder="YYYY-MM (optional)" className="w-[130px] h-7 text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={marking}>Save</Button>
        {m.ok && <span className="text-green-800">Saved</span>}
      </form>

      <form action={approve} className="space-y-2">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="conversationId" value={conversationId ?? ""} />
        <div className="flex items-center gap-2"><h2 className="text-[13px] font-bold">Reply</h2>{aiDraft && <span className="px-1.5 py-0.5 rounded bg-[#E8EAF0] text-[#3B4252] text-[10px] font-bold">AI draft — edit freely</span>}<span className="text-[11px] text-muted-foreground">from the conversation&apos;s sender · sent within 5 minutes</span></div>
        <Input name="subject" defaultValue={subject} className="text-sm" aria-label="Subject" />
        <textarea name="text" defaultValue={draft} rows={5} className="w-full border rounded-md px-3 py-2 text-[13px] leading-relaxed font-sans" placeholder="Write a short reply…" />
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="rc" className="text-muted-foreground">Check back on</label>
          <Input id="rc" type="date" name="reconnect_at" defaultValue={reconnectAt} className="w-[180px] h-7 text-xs" />
          <span className="text-[11px] text-muted-foreground">{reconnectAt ? "suggested by the AI · clear it to skip" : "optional"} · policy checks run before it is scheduled</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="submit" disabled={approving}>{approving ? "Queuing…" : "Approve & send"}</Button>
          <Button type="submit" variant="outline" formAction={skip} disabled={skipping}>Skip — no reply needed</Button>
          <div className="flex-1" />
          {!confirmSuppress ? (
            <Button type="button" variant="outline" className="text-[#7F1D1D]" onClick={() => setConfirmSuppress(true)}>Suppress candidate</Button>
          ) : (
            <Button type="submit" variant="destructive" formAction={suppressA} disabled={suppressing}>Confirm: never contact again</Button>
          )}
        </div>
        {a.ok && <p className="text-xs text-green-800">Reply queued — the dispatcher sends it on its next run.</p>}
        {err && <p className="text-xs text-red-700">{err}</p>}
      </form>
    </div>
  );
}
