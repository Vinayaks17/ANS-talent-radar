import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MarketBadge, commLabel } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatAvailability, fullName, initials, money } from "@/lib/format";
import { CandidateActions } from "./candidate-actions";

export default async function CandidatePage(props: PageProps<"/candidates/[id]">) {
  const { id } = await props.params;
  const s = await getSession();
  const db = await createClient();

  const { data: c } = await db.from("candidates").select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
  if (!c) notFound();

  const [{ data: facts }, { data: events }, { data: messages }, { data: actions }, { data: enrollments }] = await Promise.all([
    db.from("candidate_facts").select("*").eq("candidate_id", id).order("reported_at", { ascending: false }).limit(50),
    db.from("audit_events").select("event_type, actor, decision, reason, model, prompt_version, created_at").eq("candidate_id", id).order("created_at", { ascending: false }).limit(40),
    db.from("messages").select("id, direction, from_address, subject, text_body, reply_text, sent_at, received_at, ai_generated, delivery_status, message_type").eq("candidate_id", id).order("created_at"),
    db.from("scheduled_actions").select("action_type, scheduled_for, status").eq("candidate_id", id).eq("status", "PENDING").order("scheduled_for").limit(1),
    db.from("campaign_enrollments").select("status, current_step, campaigns(id, name)").eq("candidate_id", id),
  ]);
  const name = fullName(c);
  const next = actions?.[0];
  const enrollment = enrollments?.[0];
  const campaign = enrollment?.campaigns as unknown as { id: string; name: string } | null;

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><Link href="/candidates" className="text-[13px] font-normal text-muted-foreground">Candidates</Link><span className="text-[#C9C2B4]">/</span>{name}</span>}>
        {canWrite(s.role) && <CandidateActions candidateId={c.id} suppressed={c.communication_status === "SUPPRESSED"} />}
      </PageHeader>

      <div className="p-8 space-y-5">
        <div className="bg-white border rounded-xl p-6 flex gap-6 items-center">
          <div className="w-14 h-14 rounded-full bg-primary text-white font-heading text-xl flex items-center justify-center shrink-0">{initials(name)}</div>
          <div className="w-[320px] space-y-1">
            <div className="text-xl font-bold">{name}</div>
            <div className="text-[13px] text-muted-foreground">{[c.current_title, c.current_company].filter(Boolean).join(" · ") || "—"}</div>
            <div className="text-[13px] text-muted-foreground">{[c.location, c.timezone, c.email].filter(Boolean).join(" · ")}</div>
            <div className="text-xs text-muted-foreground pt-1">Source: {c.source ?? "—"}{campaign && <> · Campaign: <Link href={`/campaigns/${campaign.id}`} className="text-primary">{campaign.name}</Link></>}</div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3">
            <Tile label="Market status" value={<MarketBadge status={c.market_status} className="text-[13px]" />} highlight />
            <Tile label="Expected timing" value={formatAvailability(c.availability_date, c.availability_precision)} sub={c.availability_precision !== "UNKNOWN" && c.availability_date ? c.availability_precision.toLowerCase().replace("_", ", ") : undefined} />
            <Tile label="Interest" value={c.preferred_roles.length ? c.preferred_roles.join(", ") : "—"} />
            <Tile label="Compensation" value={money(c.target_salary as never)} />
            <Tile label="Last verified" value={formatDate(c.last_verified_at)} />
            <Tile label="Next action" value={next ? `${next.action_type.replace(/_/g, " ").toLowerCase()} · ${formatDate(next.scheduled_for)}` : commLabel(c.communication_status)} accent />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[520px_1fr] gap-5 items-start">
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Candidate memory <span className="font-normal text-muted-foreground">· AI summary</span></CardTitle></CardHeader>
              <CardContent><p className="text-[13px] leading-relaxed">{c.memory_summary ?? "Nothing recorded yet — filled after the first reply."}</p>{c.notes && <p className="text-xs text-muted-foreground mt-2">Notes: {c.notes}</p>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Known facts <span className="font-normal text-muted-foreground">· every fact keeps its source and confidence</span></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(facts ?? []).length === 0 && <p className="text-xs text-muted-foreground">No facts yet.</p>}
                {(facts ?? []).map((f) => (
                  <div key={f.id} className="grid grid-cols-[140px_1fr_110px_44px] gap-2 text-[13px] items-center">
                    <div className="text-muted-foreground">{f.fact_type.replace(/_/g, " ").toLowerCase()}</div>
                    <div className="truncate">{typeof f.value_json === "object" && f.value_json ? Object.entries(f.value_json as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : String(f.value_json)}</div>
                    <div className="text-xs text-muted-foreground">{f.source.toLowerCase()} · {formatDate(f.reported_at)}</div>
                    <div className="font-semibold text-right">{f.confidence != null ? Number(f.confidence).toFixed(2) : "—"}</div>
                  </div>
                ))}
                {c.skills.length > 0 && <div className="grid grid-cols-[140px_1fr] gap-2 text-[13px] pt-1 border-t"><div className="text-muted-foreground">skills</div><div>{c.skills.join(", ")}</div></div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Intelligence timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(events ?? []).length === 0 && <p className="text-xs text-muted-foreground">No events yet.</p>}
                {(events ?? []).map((e, i) => (
                  <div key={i} className="flex gap-3 text-[13px]">
                    <div className="w-[60px] shrink-0 text-muted-foreground">{formatDate(e.created_at, { day: "numeric", month: "short" })}</div>
                    <div>{e.event_type.replace(/_/g, " ").toLowerCase()}{e.decision ? ` → ${e.decision}` : ""}{e.reason ? ` — ${e.reason}` : ""} <span className="text-muted-foreground">{e.actor}{e.model ? ` · ${e.model}` : ""}</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Conversation <span className="font-normal text-muted-foreground">· {(messages ?? []).length} messages</span></CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {(messages ?? []).length === 0 && <p className="text-xs text-muted-foreground">No messages yet. {c.communication_status === "NOT_CONTACTED" ? "Enrol this candidate in a campaign to start." : ""}</p>}
              {(messages ?? []).map((m) => (
                <div key={m.id} className={`rounded-lg px-4 py-3 space-y-1 ${m.direction === "INBOUND" ? "bg-[#FFF8F2] border border-[#F5D9C0]" : "bg-[#F7F5EF]"}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <strong className="text-foreground">{m.direction === "INBOUND" ? name : m.from_address}</strong>
                    <span>{m.message_type.replace("_", "-").toLowerCase()}</span>
                    <div className="flex-1" />
                    <span>{formatDateTime(m.direction === "INBOUND" ? m.received_at : m.sent_at)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white border text-[10px]">{m.delivery_status.toLowerCase()}</span>
                    {m.ai_generated && <span className="px-1.5 py-0.5 rounded bg-[#E8EAF0] text-[#3B4252] text-[10px] font-bold">AI-written</span>}
                  </div>
                  {m.subject && m.direction === "OUTBOUND" && <div className="text-[13px] font-semibold">{m.subject}</div>}
                  <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{m.direction === "INBOUND" ? (m.reply_text || m.text_body) : m.text_body}</p>
                </div>
              ))}
              {next && (
                <div className="flex items-center gap-2 px-3.5 py-3 border border-dashed rounded-lg text-xs text-muted-foreground">
                  Next: <strong className="text-foreground">{next.action_type.replace(/_/g, " ").toLowerCase()} · {formatDateTime(next.scheduled_for)}</strong> · sends only if suppression, eligibility and limit checks pass on the day
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, sub, highlight, accent }: { label: string; value: React.ReactNode; sub?: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3.5 py-3 space-y-1 ${highlight ? "bg-[#FCE8D2]" : accent ? "bg-[#DBEAFE]" : "bg-[#F7F5EF]"}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${highlight ? "text-[#7C3A00]" : accent ? "text-[#1E3A8A]" : "text-muted-foreground"}`}>{label}</div>
      <div className={`text-[15px] font-bold ${accent ? "text-[#1E3A8A]" : ""}`}>{value} {sub && <span className="text-[11px] font-medium text-muted-foreground">{sub}</span>}</div>
    </div>
  );
}

