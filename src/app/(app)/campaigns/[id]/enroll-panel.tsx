"use client";

import { useActionState } from "react";
import { previewEnrollment, enrollCandidates, type EnrollState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MARKETS: [string, string][] = [["UNKNOWN", "Unknown"], ["PASSIVE", "Passive"], ["OPEN_LATER", "Open later"], ["OPEN_TO_RIGHT_OPPORTUNITY", "Open to right role"], ["NOT_LOOKING", "Not looking"], ["AVAILABLE_NOW", "Available now"]];

export function EnrollPanel({ campaignId, active }: { campaignId: string; active: boolean }) {
  const preview = previewEnrollment.bind(null, campaignId);
  const run = enrollCandidates.bind(null, campaignId);
  const [p, previewAction, previewing] = useActionState<EnrollState, FormData>(preview, {});
  const [e, enrollAction, enrolling] = useActionState<EnrollState, FormData>(run, {});

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Enrol candidates</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label className="text-xs">Market status</Label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {MARKETS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="marketStatuses" value={k} defaultChecked={k === "UNKNOWN" || k === "PASSIVE"} /> {l}</label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="industry" className="text-xs">Industry contains</Label><Input id="industry" name="industry" placeholder="freight" /></div>
            <div className="space-y-1"><Label htmlFor="loc" className="text-xs">Location contains</Label><Input id="loc" name="locationContains" placeholder="TX" /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="limit" className="text-xs">Max candidates this time</Label><Input id="limit" name="limit" type="number" defaultValue={500} min={1} max={20000} /></div>
          <p className="text-[11px] text-muted-foreground">Excludes suppressed, not-interested, anyone already in a campaign, anyone contacted within the recontact interval, and anyone in a live conversation.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="submit" variant="outline" formAction={previewAction} disabled={previewing}>{previewing ? "Counting…" : "Preview count"}</Button>
            <Button type="submit" formAction={enrollAction} disabled={enrolling || !active} title={active ? "" : "Activate the campaign first"}>{enrolling ? "Enrolling…" : "Enrol & schedule"}</Button>
          </div>
          {p.preview != null && <p className="text-xs">Matches: <strong>{p.preview.toLocaleString()}</strong> candidates</p>}
          {e.enrolled != null && <p className="text-xs text-green-800">Enrolled {e.enrolled.toLocaleString()} — first emails spread at ~{e.dailyCapacity}/day inside the send window.</p>}
          {(p.error || e.error) && <p className="text-xs text-red-700">{p.error ?? e.error}</p>}
          {!active && <p className="text-[11px] text-[#7C3A00]">Campaign is not active. Enrolment schedules real sends, so activate it first.</p>}
        </form>
      </CardContent>
    </Card>
  );
}
