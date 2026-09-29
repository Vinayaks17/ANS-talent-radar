"use client";

import { useActionState } from "react";
import { createRequirement, type ReqState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function RequirementForm() {
  const [state, action, pending] = useActionState<ReqState, FormData>(createRequirement, {});
  return (
    <form action={action}>
      <Card>
        <CardContent className="pt-6 grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5"><Label htmlFor="title">Role title</Label><Input id="title" name="title" required placeholder="Logistics Operations Manager" /></div>
          <div className="space-y-1.5"><Label htmlFor="client_name">Client</Label><Input id="client_name" name="client_name" placeholder="Client name (optional)" /></div>
          <div className="space-y-1.5"><Label htmlFor="location">Location</Label><Input id="location" name="location" placeholder="Dallas, TX" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="remote_policy">Work mode</Label>
            <select id="remote_policy" name="remote_policy" defaultValue="" className="border rounded-md px-2.5 h-9 bg-white text-sm w-full">
              <option value="">Not specified</option><option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </div>
          <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
            <div className="space-y-1.5"><Label htmlFor="comp_min">Pay from (yearly)</Label><Input id="comp_min" name="comp_min" inputMode="numeric" placeholder="90000" /></div>
            <div className="space-y-1.5"><Label htmlFor="comp_max">Pay to</Label><Input id="comp_max" name="comp_max" inputMode="numeric" placeholder="120000" /></div>
            <div className="space-y-1.5"><Label htmlFor="currency">Currency</Label><Input id="currency" name="currency" defaultValue="USD" maxLength={3} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="must_have">Must-haves <span className="text-muted-foreground font-normal">(one per line)</span></Label><textarea id="must_have" name="must_have" rows={4} className="w-full border rounded-md px-3 py-2 text-sm" placeholder={"TMS experience\n5+ years in 3PL operations\nTeam leadership"} /></div>
          <div className="space-y-1.5"><Label htmlFor="nice_to_have">Nice-to-haves <span className="text-muted-foreground font-normal">(one per line)</span></Label><textarea id="nice_to_have" name="nice_to_have" rows={4} className="w-full border rounded-md px-3 py-2 text-sm" placeholder={"Lean / Six Sigma\nCross-border freight"} /></div>
          <div className="col-span-2 space-y-1.5"><Label htmlFor="description">Job description <span className="text-muted-foreground font-normal">(paste it in)</span></Label><textarea id="description" name="description" rows={8} className="w-full border rounded-md px-3 py-2 text-sm" /></div>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save requirement"}</Button>
            <span className="text-xs text-muted-foreground">Candidates are matched on work facts only — no names, contact details or personal traits are sent to the AI.</span>
          </div>
          {state.error && <p className="col-span-2 text-sm text-red-700">{state.error}</p>}
        </CardContent>
      </Card>
    </form>
  );
}
