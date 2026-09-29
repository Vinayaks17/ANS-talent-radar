import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MarketBadge } from "@/components/status-badge";
import { formatAvailability, formatDateTime, money } from "@/lib/format";
import { MatchControls, FindMatchesButton, RequirementStatus } from "./match-controls";

export const metadata = { title: "Requirement" };
export const maxDuration = 300; // the "Find matches" action scores up to 40 candidates with the AI

const scoreCls = (n: number) => (n >= 75 ? "bg-[#DCEFE3] text-[#14532D]" : n >= 55 ? "bg-[#FCE8D2] text-[#7C3A00]" : "bg-[#EEE] text-[#4B5563]");

export default async function RequirementPage(props: PageProps<"/requirements/[id]">) {
  const { id } = await props.params;
  const s = await getSession();
  const db = await createClient();
  const { data: settings } = await db.from("org_settings").select("matching_enabled, models").eq("org_id", s.orgId).single();
  if (!settings?.matching_enabled) redirect("/");

  const { data: req } = await db.from("requirements").select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
  if (!req) notFound();
  const { data: matches } = await db.from("requirement_matches")
    .select("id, role_fit, readiness, match_score, summary, strengths, gaps, status, model, candidate_id, candidates(first_name, last_name, current_title, current_company, location, market_status, availability_date, availability_precision)")
    .eq("requirement_id", id).order("match_score", { ascending: false });

  const rows = (matches ?? []).map((m) => ({ ...m, c: m.candidates as unknown as { first_name: string | null; last_name: string | null; current_title: string | null; current_company: string | null; location: string | null; market_status: string; availability_date: string | null; availability_precision: string } }));
  const shortlisted = rows.filter((r) => r.status === "SHORTLISTED");
  const suggestedAll = rows.filter((r) => r.status === "SUGGESTED");
  const suggested = suggestedAll.filter((r) => r.match_score >= 25);
  const weak = suggestedAll.filter((r) => r.match_score < 25);
  const rejected = rows.filter((r) => r.status === "REJECTED");
  const canEdit = canWrite(s.role);
  const model = ((settings.models ?? {}) as Record<string, string>).match ?? "gpt-5.6-terra";
  const comp = req.comp_min || req.comp_max ? `${money({ currency: req.currency, amount: req.comp_min ?? undefined })}${req.comp_max ? ` – ${money({ currency: req.currency, amount: req.comp_max })}` : "+"}` : null;

  return (
    <>
      <PageHeader title={req.title} subtitle={[req.client_name, req.location, req.remote_policy, comp].filter(Boolean).join(" · ")}>
        {canWrite(s.role) && <RequirementStatus id={req.id} status={req.status} />}
        {canWrite(s.role) && <FindMatchesButton requirementId={req.id} hasRun={!!req.last_matched_at} />}
      </PageHeader>
      <div className="p-8 space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
          <div className="space-y-5">
            {shortlisted.length > 0 && (
              <section className="bg-white border rounded-xl overflow-hidden">
                <h2 className="px-5 py-3 text-sm font-bold border-b">Shortlist <span className="font-normal text-muted-foreground">· {shortlisted.length}</span></h2>
                <Header />{shortlisted.map((r) => <Row key={r.id} r={r} canEdit={canEdit} />)}
              </section>
            )}
            <section className="bg-white border rounded-xl overflow-hidden">
              <h2 className="px-5 py-3 text-sm font-bold border-b">Suggested matches <span className="font-normal text-muted-foreground">· ranked by Role fit × Market readiness{req.last_matched_at ? ` · run ${formatDateTime(req.last_matched_at)}` : ""}</span></h2>
              {suggested.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">{req.last_matched_at ? (weak.length ? "No strong suggestions — only weak matches (below)." : "No open suggestions — everything has been shortlisted or rejected.") : "Click “Find matches” to rank the pool for this role."}</p>
              ) : (<><Header />{suggested.map((r, i) => <Row key={r.id} r={r} rank={i + 1} canEdit={canEdit} />)}</>)}
            </section>
            {weak.length > 0 && (
              <details className="bg-white border rounded-xl overflow-hidden">
                <summary className="px-5 py-3 text-sm font-bold cursor-pointer">Weak matches <span className="font-normal text-muted-foreground">· {weak.length} scored under 25</span></summary>
                <Header />{weak.map((r) => <Row key={r.id} r={r} canEdit={canEdit} />)}
              </details>
            )}
            {rejected.length > 0 && (
              <details className="bg-white border rounded-xl overflow-hidden">
                <summary className="px-5 py-3 text-sm font-bold cursor-pointer">Rejected <span className="font-normal text-muted-foreground">· {rejected.length}</span></summary>
                <Header />{rejected.map((r) => <Row key={r.id} r={r} canEdit={canEdit} />)}
              </details>
            )}
          </div>
          <aside className="space-y-4">
            <div className="bg-white border rounded-xl p-4 space-y-3 text-[13px]">
              <h2 className="font-bold">Requirement</h2>
              {req.must_have.length > 0 && <div><div className="text-xs font-semibold text-muted-foreground mb-1">Must-haves</div><ul className="list-disc pl-4 space-y-0.5">{req.must_have.map((m) => <li key={m}>{m}</li>)}</ul></div>}
              {req.nice_to_have.length > 0 && <div><div className="text-xs font-semibold text-muted-foreground mb-1">Nice-to-haves</div><ul className="list-disc pl-4 space-y-0.5">{req.nice_to_have.map((m) => <li key={m}>{m}</li>)}</ul></div>}
              {req.description && <details><summary className="text-xs font-semibold text-muted-foreground cursor-pointer">Job description</summary><p className="whitespace-pre-wrap text-xs mt-2 leading-relaxed">{req.description}</p></details>}
            </div>
            <div className="bg-white border rounded-xl p-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
              <h2 className="font-bold text-foreground text-[13px]">How the ranking works</h2>
              <p><strong className="text-foreground">Fit</strong> (0–100) is scored by the AI ({model}) from work facts only: title, skills, industry, location, pay and what the candidate told us.</p>
              <p><strong className="text-foreground">Ready</strong> (0–100) is calculated by code from their market status, timing and how recently they confirmed it.</p>
              <p><strong className="text-foreground">Match</strong> = Fit scaled by readiness: a perfect fit who isn&apos;t moving keeps half their score.</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

type MatchRow = {
  id: string; role_fit: number; readiness: number; match_score: number; summary: string | null; strengths: string[]; gaps: string[]; status: string; candidate_id: string;
  c: { first_name: string | null; last_name: string | null; current_title: string | null; current_company: string | null; location: string | null; market_status: string; availability_date: string | null; availability_precision: string } | null;
};

function Row({ r, rank, canEdit }: { r: MatchRow; rank?: number; canEdit: boolean }) {
  return (
    <div className="grid grid-cols-[34px_minmax(220px,1.3fr)_64px_64px_64px_minmax(260px,2fr)_150px] gap-3 items-start px-5 py-3.5 border-b last:border-0 text-[13px]">
      <div className="text-muted-foreground font-semibold pt-0.5">{rank ?? ""}</div>
      <div className="min-w-0">
        <Link href={`/candidates/${r.candidate_id}`} className="font-semibold hover:underline">{[r.c?.first_name, r.c?.last_name].filter(Boolean).join(" ") || "—"}</Link>
        <div className="text-xs text-muted-foreground truncate">{[r.c?.current_title, r.c?.current_company].filter(Boolean).join(" · ")}</div>
        <div className="text-xs text-muted-foreground truncate">{r.c?.location}</div>
        <div className="flex gap-1.5 mt-1 items-center">{r.c && <MarketBadge status={r.c.market_status} className="px-1.5 py-0.5" />}{r.c?.availability_date && <span className="text-[11px] text-muted-foreground">{formatAvailability(r.c.availability_date, r.c.availability_precision)}</span>}</div>
      </div>
      <div><span className={`inline-block min-w-[40px] text-center px-2 py-1 rounded-md font-bold ${scoreCls(r.match_score)}`}>{r.match_score}</span></div>
      <div className="pt-1 font-semibold">{r.role_fit}</div>
      <div className="pt-1 font-semibold">{r.readiness}</div>
      <div className="text-xs space-y-1">
        {r.summary && <p className="text-[13px] leading-snug">{r.summary}</p>}
        {r.strengths.length > 0 && <p className="text-[#14532D]">+ {r.strengths.join(" · ")}</p>}
        {r.gaps.length > 0 && <p className="text-[#7C3A00]">– {r.gaps.join(" · ")}</p>}
      </div>
      <div>{canEdit && <MatchControls matchId={r.id} status={r.status} />}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="grid grid-cols-[34px_minmax(220px,1.3fr)_64px_64px_64px_minmax(260px,2fr)_150px] gap-3 px-5 py-2.5 bg-[#F7F5EF] border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <div>#</div><div>Candidate</div><div>Match</div><div>Fit</div><div>Ready</div><div>Why</div><div />
    </div>
  );
}
