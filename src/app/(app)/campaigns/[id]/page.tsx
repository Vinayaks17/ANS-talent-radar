import { notFound } from "next/navigation";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CampaignForm } from "./campaign-form";
import { EnrollPanel } from "./enroll-panel";
import { StatusButtons } from "./status-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CampaignPage(props: PageProps<"/campaigns/[id]">) {
  const { id } = await props.params;
  const s = await getSession();
  const db = await createClient();

  const [{ data: c }, { data: steps }, { data: senders }, { data: settings }, { data: enrollments }, { data: msgs }] = await Promise.all([
    db.from("campaigns").select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle(),
    db.from("campaign_steps").select("*").eq("campaign_id", id).order("step_number"),
    db.from("senders").select("id, email, display_name, status, daily_cap_new").eq("org_id", s.orgId).order("created_at"),
    db.from("org_settings").select("send_days, send_window_start, send_window_end, max_new_per_sender_per_day").eq("org_id", s.orgId).single(),
    db.from("campaign_enrollments").select("status, candidate_id").eq("campaign_id", id),
    db.from("messages").select("direction, candidate_id, sent_at").eq("campaign_id", id),
  ]);
  if (!c) notFound();

  const enr = enrollments ?? [];
  const contacted = new Set((msgs ?? []).filter((m) => m.direction === "OUTBOUND").map((m) => m.candidate_id));
  const replied = new Set((msgs ?? []).filter((m) => m.direction === "INBOUND").map((m) => m.candidate_id));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const sentToday = (msgs ?? []).filter((m) => m.direction === "OUTBOUND" && m.sent_at && new Date(m.sent_at) >= today).length;

  const candIds = enr.map((e) => e.candidate_id);
  const commCounts: Record<string, number> = {};
  if (candIds.length) {
    for (let i = 0; i < candIds.length; i += 500) {
      const { data } = await db.from("candidates").select("communication_status").in("id", candIds.slice(i, i + 500));
      for (const r of data ?? []) commCounts[r.communication_status] = (commCounts[r.communication_status] ?? 0) + 1;
    }
  }
  const { count: suppressedCount } = await db.from("campaign_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "SUPPRESSED");
  const writable = canWrite(s.role);

  return (
    <>
      <PageHeader title={c.name} subtitle={<span className="flex items-center gap-2"><span className="text-muted-foreground">Campaign</span><StatusPill status={c.status} /></span>}>
        {writable && <StatusButtons id={c.id} status={c.status} />}
      </PageHeader>

      <div className="p-8 space-y-5">
        <div className="grid grid-cols-6 gap-3">
          <Tile label="Enrolled" n={enr.length} />
          <Tile label="Contacted" n={contacted.size} />
          <Tile label="Replied" n={replied.size} suffix={contacted.size ? `${Math.round((replied.size / contacted.size) * 100)}%` : undefined} />
          <Tile label="Waiting for reply" n={commCounts.WAITING_FOR_REPLY ?? 0} />
          <Tile label="Suppressed" n={suppressedCount ?? 0} />
          <Tile label="Sent today" n={sentToday} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
          <CampaignForm
            campaign={{ ...c, send_window_start: c.send_window_start?.slice(0, 5) ?? null, send_window_end: c.send_window_end?.slice(0, 5) ?? null }}
            steps={steps ?? []}
            senders={senders ?? []}
            orgWindow={{ days: settings?.send_days ?? [2, 3, 4], start: settings?.send_window_start.slice(0, 5) ?? "09:00", end: settings?.send_window_end.slice(0, 5) ?? "16:00" }}
            writable={writable}
          />
          <div className="space-y-5">
            {writable && <EnrollPanel campaignId={c.id} active={c.status === "ACTIVE"} />}
            <Card>
              <CardHeader><CardTitle className="text-sm">Where enrolled candidates are</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                {[["NOT_CONTACTED", "Not contacted"], ["SEQUENCE_ACTIVE", "In sequence"], ["WAITING_FOR_REPLY", "Waiting for reply"], ["CONVERSATION_ACTIVE", "Conversation"], ["NURTURE_SCHEDULED", "Nurture scheduled"], ["HUMAN_REVIEW", "Human review"], ["CLOSED", "Closed"], ["SUPPRESSED", "Suppressed"]].map(([k, l]) => {
                  const n = commCounts[k] ?? 0; const max = Math.max(1, ...Object.values(commCounts));
                  return (
                    <div key={k} className="flex items-center gap-2.5">
                      <div className="w-[120px] text-muted-foreground">{l}</div>
                      <div className="flex-1 h-2 bg-[#F1EFE9] rounded-full"><div className="h-2 bg-primary rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div>
                      <div className="w-9 text-right font-semibold">{n}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Before any email goes out</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {["Suppression list check", "Eligibility: no live conversation, minimum gap since last touch", "Campaign and system daily limits", "Send window in the candidate's time zone"].map((t, i) => (
                  <div key={t} className="flex items-center gap-2"><span className="w-[18px] h-[18px] rounded-full bg-[#DCEFE3] text-[#14532D] text-[11px] font-bold flex items-center justify-center">{i + 1}</span>{t}</div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Tile({ label, n, suffix }: { label: string; n: number; suffix?: string }) {
  return (
    <div className="bg-white border rounded-lg px-4 py-3.5">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-heading text-2xl font-medium">{n.toLocaleString()} {suffix && <span className="text-xs font-sans text-muted-foreground">{suffix}</span>}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = { ACTIVE: "bg-[#DCEFE3] text-[#14532D]", PAUSED: "bg-[#FCE8D2] text-[#7C3A00]", DRAFT: "bg-[#E8EAF0] text-[#3B4252]", ARCHIVED: "bg-[#EEE] text-[#4B5563]" };
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${cls[status] ?? ""}`}>{status.toLowerCase()}</span>;
}
