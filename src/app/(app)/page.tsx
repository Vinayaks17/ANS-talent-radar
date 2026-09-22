import Link from "next/link";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/queries/dashboard";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { marketLabel } from "@/components/status-badge";

export const metadata = { title: "Dashboard" };

const TILES: [string, string, string?][] = [
  ["AVAILABLE_NOW", "Available now", "text-[#14532D]"],
  ["OPEN_TO_RIGHT_OPPORTUNITY", "Open to the right role"],
  ["OPEN_LATER", "Open later", "text-[#7C3A00]"],
  ["PASSIVE", "Passive"],
  ["NOT_LOOKING", "Not looking"],
  ["UNKNOWN", "Unknown", "text-muted-foreground"],
];

export default async function DashboardPage() {
  const s = await getSession();
  const db = await createClient();
  const d = await loadDashboard(db, s.orgId);
  const maxMonth = Math.max(1, ...d.futureAvailability.map((m) => m.count));
  const maxReply = Math.max(1, ...Object.values(d.repliesByMarket));
  const replyOrder = ["AVAILABLE_NOW", "OPEN_TO_RIGHT_OPPORTUNITY", "OPEN_LATER", "PASSIVE", "NOT_LOOKING", "NOT_INTERESTED", "UNKNOWN"];

  return (
    <>
      <PageHeader title="Talent intelligence">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${d.outreachPaused ? "bg-[#FBE2E2] text-[#7F1D1D]" : "bg-[#DCEFE3] text-[#14532D]"}`}>
          <span className={`w-2 h-2 rounded-full ${d.outreachPaused ? "bg-[#B91C1C]" : "bg-[#16A34A]"}`} />
          {d.outreachPaused ? "Outreach paused" : "Outreach running"}
        </div>
      </PageHeader>

      <div className="p-8 space-y-5">
        <div className="flex gap-5 items-stretch">
          <div className="w-[300px] shrink-0 rounded-xl bg-primary text-primary-foreground p-6 flex flex-col gap-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#B7C3DA]">Candidates mapped</div>
            <div className="font-heading font-bold text-5xl leading-none">{d.total.toLocaleString()}</div>
            <div className="text-[13px] text-[#D6DEEC] mt-1.5"><strong className="text-[var(--brand-coral)]">{d.verifiedPct}%</strong> with a verified market status in the last 180 days</div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3.5">
            {TILES.map(([key, label, cls]) => (
              <Link key={key} href={`/candidates?market=${key}`} className="bg-white border rounded-xl px-4 py-4 flex flex-col gap-1 hover:border-primary/40">
                <div className="text-xs font-semibold text-muted-foreground">{label}</div>
                <div className={`font-heading font-medium text-3xl leading-tight ${cls ?? ""}`}>{(d.byMarket[key] ?? 0).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-5 items-stretch">
          <Card className="flex-1">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[15px] font-bold">Future availability</h2>
                <span className="text-xs text-muted-foreground">candidates who said they will be open, by month · next 6 months</span>
              </div>
              <div className="flex items-end gap-4 h-[190px] px-2 border-b">
                {d.futureAvailability.map((m, i) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                    <div className={`text-xs ${i === d.futureAvailability.length - 1 ? "font-bold" : "font-semibold text-muted-foreground"}`}>{m.count}</div>
                    <div className={`w-full rounded-t ${i === d.futureAvailability.length - 1 ? "bg-[var(--brand-coral)]" : "bg-primary"}`} style={{ height: `${Math.max(2, (m.count / maxMonth) * 168)}px` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-4 px-2">
                {d.futureAvailability.map((m) => <div key={m.month} className="flex-1 text-center text-xs text-muted-foreground">{m.month}</div>)}
              </div>
            </CardContent>
          </Card>

          <Card className="w-[380px] shrink-0">
            <CardContent className="pt-5 space-y-3.5">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[15px] font-bold">Replies this week</h2>
                <span className="font-heading text-[22px] text-primary">{d.repliesThisWeek}</span>
              </div>
              {d.repliesThisWeek === 0 ? (
                <p className="text-xs text-muted-foreground">No replies yet. They appear here as candidates answer.</p>
              ) : (
                <div className="space-y-2.5">
                  {replyOrder.filter((k) => d.repliesByMarket[k]).map((k) => (
                    <div key={k} className="flex items-center gap-2.5">
                      <div className="w-[118px] text-xs text-muted-foreground">{marketLabel(k)}</div>
                      <div className="flex-1 h-2.5 bg-[#F1EFE9] rounded-full"><div className="h-2.5 bg-primary rounded-full" style={{ width: `${(d.repliesByMarket[k] / maxReply) * 100}%` }} /></div>
                      <div className="w-7 text-right text-xs font-semibold">{d.repliesByMarket[k]}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-5 items-stretch">
          <Card className="flex-1">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center"><h2 className="text-[15px] font-bold">Needs a human</h2><div className="flex-1" /><Link href="/review" className="text-xs font-semibold text-primary">Open review queue →</Link></div>
              <div className="flex gap-3">
                <Stat n={d.openReview} label="replies waiting for approval" />
                <Stat n={d.flaggedReview} label="flagged: complaint, legal, negotiation" cls="text-[#7F1D1D]" />
                <Stat n={d.lowConfidenceReview} label="low-confidence classifications" />
              </div>
            </CardContent>
          </Card>
          <Card className="w-[380px] shrink-0">
            <CardContent className="pt-5 space-y-2.5">
              <div className="flex items-center"><h2 className="text-[15px] font-bold">Today&apos;s sending</h2><div className="flex-1" /><Link href="/campaigns" className="text-xs font-semibold text-primary">Campaigns →</Link></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Sent</span><strong className="text-foreground">{d.sentToday} of {d.dailyCap} daily cap</strong></div>
              <div className="h-2 bg-[#F1EFE9] rounded-full"><div className="h-2 bg-primary rounded-full" style={{ width: `${d.dailyCap ? Math.min(100, (d.sentToday / d.dailyCap) * 100) : 0}%` }} /></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Active campaigns</span><strong className="text-foreground">{d.activeCampaigns}</strong></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls?: string }) {
  return (
    <div className="flex-1 flex items-center gap-3 px-3.5 py-3 border rounded-lg">
      <div className={`font-heading text-2xl font-medium ${cls ?? ""}`}>{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
