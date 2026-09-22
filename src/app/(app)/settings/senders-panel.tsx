"use client";

import { useActionState, useTransition } from "react";
import { addSender, setSenderStatus } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Sender = { id: string; email: string; display_name: string; status: string; daily_cap_new: number; daily_cap_followup: number; warmup_started_at: string; warmup_day: number };

export function SendersPanel({ senders, isAdmin }: { senders: Sender[]; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(addSender, {});
  const [, start] = useTransition();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Sender accounts</CardTitle>
        <span className="text-xs text-muted-foreground">Add the domain in Resend first; DNS records are shown there.</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {senders.length === 0 && <p className="text-sm text-muted-foreground">No senders yet. Add the first identity below.</p>}
        {senders.map((s) => {
          return (
            <div key={s.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{s.email}</div>
                <div className="text-xs text-muted-foreground">{s.display_name} · {s.daily_cap_new} new · {s.daily_cap_followup} follow-up / day</div>
              </div>
              <Badge variant="outline" className={s.status === "WARMED" ? "bg-[#DCEFE3] text-[#14532D] border-0" : s.status === "WARMING" ? "bg-[#FCE8D2] text-[#7C3A00] border-0" : "bg-[#EEE] text-[#4B5563] border-0"}>
                {s.status === "WARMING" ? `Warming · day ${s.warmup_day}` : s.status.toLowerCase()}
              </Badge>
              {isAdmin && (
                <select
                  defaultValue={s.status}
                  onChange={(e) => start(() => { void setSenderStatus(s.id, e.target.value as "WARMING" | "WARMED" | "PAUSED"); })}
                  className="border rounded-md px-2 py-1 bg-white text-xs"
                >
                  <option value="WARMING">Warming</option>
                  <option value="WARMED">Warmed</option>
                  <option value="PAUSED">Paused</option>
                </select>
              )}
            </div>
          );
        })}
        {isAdmin && (
          <form action={action} className="grid grid-cols-[1fr_1fr_80px_80px_auto] gap-2 items-end pt-2">
            <Input name="email" type="email" placeholder="sushant@talent.example.com" required aria-label="Sender email" />
            <Input name="display_name" placeholder="Sushant · Example RPO" required aria-label="Display name" />
            <Input name="daily_cap_new" type="number" defaultValue={20} aria-label="Daily cap new" />
            <Input name="daily_cap_followup" type="number" defaultValue={10} aria-label="Daily cap follow-up" />
            <Button type="submit" variant="outline" disabled={pending}>Add</Button>
            {state.error && <p className="col-span-5 text-xs text-red-700">{state.error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
