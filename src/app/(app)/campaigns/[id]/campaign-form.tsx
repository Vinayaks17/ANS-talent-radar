"use client";

import { useActionState, useState } from "react";
import { saveCampaign, type CampaignState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Campaign = {
  id: string; name: string; objective: string | null; target_audience: string | null; sector: string | null;
  recontact_days: number; daily_sender_limit: number; sender_ids: string[];
  send_days: number[] | null; send_window_start: string | null; send_window_end: string | null;
};
type Step = { id: string; step_number: number; delay_days: number; message_type: string; use_ai: boolean; template_subject: string | null; template_body: string | null };
type Sender = { id: string; email: string; display_name: string; status: string; daily_cap_new: number };

const DAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];
const TYPE_CLS: Record<string, string> = { INITIAL: "bg-[#DBEAFE] text-[#1E3A8A]", FOLLOW_UP: "bg-[#E8EAF0] text-[#3B4252]", FINAL: "bg-[#E8EAF0] text-[#3B4252]", NURTURE: "bg-[#FCE8D2] text-[#7C3A00]" };

export function CampaignForm({ campaign, steps, senders, orgWindow, writable }: { campaign: Campaign; steps: Step[]; senders: Sender[]; orgWindow: { days: number[]; start: string; end: string }; writable: boolean }) {
  const [state, action, pending] = useActionState<CampaignState, FormData>(saveCampaign.bind(null, campaign.id), {});
  const [inherit, setInherit] = useState(campaign.send_days == null);
  const ro = !writable;

  return (
    <form action={action} className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-sm">Campaign</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3.5">
          <F label="Name" name="name" value={campaign.name} ro={ro} />
          <F label="Objective" name="objective" value={campaign.objective ?? ""} placeholder="Identify current / future availability" ro={ro} />
          <F label="Target audience" name="target_audience" value={campaign.target_audience ?? ""} placeholder="Senior Freight Brokers / Logistics Sales, US" ro={ro} />
          <F label="Sector (used in emails)" name="sector" value={campaign.sector ?? ""} placeholder="3PL and freight brokerage" ro={ro} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Sequence <span className="font-normal text-muted-foreground">— stops after the final step; nurture only if no opt-out. Merge fields: {"{{first_name}} {{sender_name}} {{org_name}} {{sector}}"}</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {steps.map((st) => (
            <div key={st.id} className="grid grid-cols-[50px_90px_110px_1fr] gap-3 items-start border-b last:border-0 pb-4">
              <input type="hidden" name="step_id" value={st.id} />
              <div className="font-bold text-sm pt-2">{st.step_number}</div>
              <div className="space-y-1"><Label className="text-[11px]">{st.step_number === 1 ? "Day" : "+ days"}</Label><Input name="delay_days" type="number" min={0} defaultValue={st.delay_days} readOnly={ro} /></div>
              <div className="space-y-1.5 pt-1">
                <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-bold ${TYPE_CLS[st.message_type] ?? ""}`}>{st.message_type.replace("_", "-").toLowerCase()}</span>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><input type="checkbox" name={`use_ai_${st.id}`} defaultChecked={st.use_ai} disabled={ro} /> AI-written</label>
              </div>
              <div className="space-y-1.5">
                <Input name="template_subject" defaultValue={st.template_subject ?? ""} placeholder="Subject" readOnly={ro} />
                <textarea name="template_body" defaultValue={st.template_body ?? ""} rows={4} readOnly={ro} className="w-full border rounded-md px-3 py-2 text-sm font-sans bg-white" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Limits and senders <span className="font-normal text-muted-foreground">— campaign limits can be lower than the system ceilings, never higher</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3.5">
            <F label="New outreach / sender / day" name="daily_sender_limit" type="number" value={String(campaign.daily_sender_limit)} ro={ro} />
            <F label="Recontact interval (days)" name="recontact_days" type="number" value={String(campaign.recontact_days)} ro={ro} />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inherit_window" checked={inherit} onChange={(e) => setInherit(e.target.checked)} disabled={ro} /> Use the organisation send window ({orgWindow.days.map((d) => DAYS.find(([n]) => n === d)?.[1]).join(", ")} · {orgWindow.start}–{orgWindow.end} candidate local time)</label>
            {!inherit && (
              <div className="grid grid-cols-[1fr_120px_120px] gap-3 items-end pl-6">
                <div className="flex gap-3 text-xs flex-wrap">
                  {DAYS.map(([n, l]) => <label key={n} className="flex items-center gap-1"><input type="checkbox" name="send_days" value={n} defaultChecked={(campaign.send_days ?? orgWindow.days).includes(n)} disabled={ro} /> {l}</label>)}
                </div>
                <Input name="send_window_start" type="time" defaultValue={campaign.send_window_start ?? orgWindow.start} readOnly={ro} />
                <Input name="send_window_end" type="time" defaultValue={campaign.send_window_end ?? orgWindow.end} readOnly={ro} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sender identities</Label>
            {senders.length === 0 && <p className="text-xs text-[#7C3A00]">No senders yet — add one in Settings before activating.</p>}
            {senders.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" name="sender_ids" value={s.id} defaultChecked={campaign.sender_ids.includes(s.id)} disabled={ro || s.status === "PAUSED"} />
                <span className="font-semibold">{s.email}</span>
                <span className="text-xs text-muted-foreground">{s.display_name} · {s.status.toLowerCase()} · {s.daily_cap_new}/day cap</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {writable && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {state.error && <span className="text-sm text-red-700">{state.error}</span>}
          {state.saved && <span className="text-sm text-green-800">Saved.</span>}
        </div>
      )}
    </form>
  );
}

function F({ label, name, value, placeholder, type = "text", ro }: { label: string; name: string; value: string; placeholder?: string; type?: string; ro: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={value} placeholder={placeholder} readOnly={ro} />
    </div>
  );
}
