"use client";

import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

const REVIEW_CATEGORIES: [string, string][] = [
  ["COMPLAINT", "Complaint or angry tone"],
  ["LEGAL_PRIVACY", "Legal / privacy question"],
  ["ANGRY", "Hostile reply"],
  ["DISCRIMINATION", "Discrimination-related"],
  ["COMP_NEGOTIATION", "Compensation negotiation"],
  ["OFFER_DISCUSSION", "Offer discussion"],
  ["CLIENT_CONFLICT", "Existing client conflict"],
  ["EXISTING_PROCESS", "Already in a recruitment process"],
  ["UNCLEAR_IDENTITY", "Unclear identity"],
  ["SENSITIVE_INFO", "Sensitive personal information"],
];

const MODEL_ACTIONS: [string, string][] = [
  ["outreach", "First-touch email"],
  ["classify", "Reply classification"],
  ["reply", "Candidate replies"],
  ["memory", "Memory updates"],
  ["resume", "Resume parsing"],
  ["match", "Requirement matching (V2)"],
];
const MODELS = ["gpt-5.6-luna", "gpt-5.6-terra"];

type Settings = {
  max_outreach_per_day: number; max_new_per_sender_per_day: number; max_followups_per_sender_per_day: number;
  min_gap_hours: number; max_unanswered_per_sequence: number; default_nurture_days: number;
  send_days: number[]; send_window_start: string; send_window_end: string; default_timezone: string;
  auto_threshold: number; review_threshold: number; approval_required: boolean;
  human_review_categories: string[]; models: Record<string, string>;
};

export function SettingsForm({ settings, isAdmin }: { settings: Settings; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const ro = !isAdmin;

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle className="text-sm">Rate limits</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Max outreach / day (all senders)" name="max_outreach_per_day" value={settings.max_outreach_per_day} ro={ro} />
            <Field label="New outreach / sender / day" name="max_new_per_sender_per_day" value={settings.max_new_per_sender_per_day} ro={ro} />
            <Field label="Follow-ups / sender / day" name="max_followups_per_sender_per_day" value={settings.max_followups_per_sender_per_day} ro={ro} />
            <Field label="Min. gap per candidate (hours)" name="min_gap_hours" value={settings.min_gap_hours} ro={ro} />
            <Field label="Max unanswered / sequence" name="max_unanswered_per_sequence" value={settings.max_unanswered_per_sequence} ro={ro} />
            <Field label="Default nurture interval (days)" name="default_nurture_days" value={settings.default_nurture_days} ro={ro} />
            <div className="col-span-2 space-y-1.5">
              <Label>Send days (candidate local time)</Label>
              <div className="flex gap-3 flex-wrap text-sm">
                {DAYS.map(([n, l]) => (
                  <label key={n} className="flex items-center gap-1.5">
                    <input type="checkbox" name="send_days" value={n} defaultChecked={settings.send_days.includes(n)} disabled={ro} /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="sws">Window start</Label><Input id="sws" name="send_window_start" type="time" defaultValue={settings.send_window_start.slice(0, 5)} readOnly={ro} /></div>
            <div className="space-y-1.5"><Label htmlFor="swe">Window end</Label><Input id="swe" name="send_window_end" type="time" defaultValue={settings.send_window_end.slice(0, 5)} readOnly={ro} /></div>
            <div className="col-span-2 space-y-1.5"><Label htmlFor="tz">Fallback time zone (unknown location)</Label><Input id="tz" name="default_timezone" defaultValue={settings.default_timezone} readOnly={ro} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">AI behaviour</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 p-3 rounded-lg bg-[#FCE8D2] text-[#7C3A00]">
              <input type="checkbox" name="approval_required" defaultChecked={settings.approval_required} disabled={ro} className="mt-0.5" />
              <span>
                <span className="block text-sm font-bold">Approval required for every AI reply</span>
                <span className="block text-xs">Pilot mode. Turn off once classification accuracy on real replies is proven.</span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fully automatic at confidence ≥" name="auto_threshold" value={settings.auto_threshold} step="0.01" ro={ro} />
              <Field label="Human review below" name="review_threshold" value={settings.review_threshold} step="0.01" ro={ro} />
            </div>
            <p className="text-xs text-muted-foreground">Between the two only safe actions run automatically. Opt-outs bypass thresholds and suppress immediately.</p>
            <div className="space-y-1.5">
              <Label>Always route to a human</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {REVIEW_CATEGORIES.map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" name="human_review_categories" value={k} defaultChecked={settings.human_review_categories.includes(k)} disabled={ro} /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Model per action</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {MODEL_ACTIONS.map(([k, l]) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{l}</span>
                    <select name={`model_${k}`} defaultValue={settings.models[k] ?? MODELS[0]} disabled={ro} className="border rounded-md px-2 py-1 bg-white text-sm">
                      {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {state.error && <span className="text-sm text-red-700">{state.error}</span>}
          {state.saved && <span className="text-sm text-green-800">Saved.</span>}
        </div>
      )}
    </form>
  );
}

function Field({ label, name, value, step, ro }: { label: string; name: string; value: number; step?: string; ro: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type="number" step={step} defaultValue={value} readOnly={ro} />
    </div>
  );
}
