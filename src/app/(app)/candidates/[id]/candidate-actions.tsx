"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { suppressCandidateById, reconnectNow } from "./actions";

export function CandidateActions({ candidateId, suppressed }: { candidateId: string; suppressed: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex gap-2">
      {!suppressed && (confirm ? (
        <Button variant="destructive" disabled={pending} onClick={() => start(async () => { const r = await suppressCandidateById(candidateId); if (r.error) toast.error(r.error); else toast.success("Suppressed — never contacted again"); })}>Confirm suppress</Button>
      ) : (
        <Button variant="outline" className="text-[#7F1D1D]" onClick={() => setConfirm(true)}>Suppress</Button>
      ))}
      {!suppressed && <Button disabled={pending} onClick={() => start(async () => { const r = await reconnectNow(candidateId); if (r.error) toast.error(r.error); else toast.success("Reconnect scheduled for the next send window"); })}>Reconnect now</Button>}
    </div>
  );
}
