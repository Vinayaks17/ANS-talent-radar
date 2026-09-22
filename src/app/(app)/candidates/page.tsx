import Link from "next/link";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MarketBadge, commLabel } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatAvailability } from "@/lib/format";

export const metadata = { title: "Candidates" };

const PAGE_SIZE = 25;
const MARKET_OPTIONS = ["AVAILABLE_NOW", "OPEN_TO_RIGHT_OPPORTUNITY", "OPEN_LATER", "PASSIVE", "NOT_LOOKING", "NOT_INTERESTED", "UNKNOWN"];

export default async function CandidatesPage(props: { searchParams: Promise<{ q?: string; market?: string; campaign?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const s = await getSession();
  const db = await createClient();
  const page = Math.max(1, Number(sp.page ?? 1));

  let query = db
    .from("candidates")
    .select("id, first_name, last_name, current_title, current_company, location, market_status, communication_status, availability_date, availability_precision, last_verified_at, next_contact_at, owner_user_id", { count: "exact" })
    .eq("org_id", s.orgId)
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (sp.q) {
    const q = sp.q.replace(/[%,]/g, " ").trim();
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,current_company.ilike.%${q}%,current_title.ilike.%${q}%`);
  }
  if (sp.market && MARKET_OPTIONS.includes(sp.market)) query = query.eq("market_status", sp.market);

  const [{ data: rows, count }, { count: total }, { count: enrolled }, { data: campaigns }] = await Promise.all([
    query,
    db.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", s.orgId),
    db.from("campaign_enrollments").select("id", { count: "exact", head: true }).eq("org_id", s.orgId).eq("status", "ENROLLED"),
    db.from("campaigns").select("id, name").eq("org_id", s.orgId).order("name"),
  ]);

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const nextActions = await loadNextActions(db, (rows ?? []).map((r) => r.id));

  return (
    <>
      <PageHeader title="Candidates" subtitle={`${(total ?? 0).toLocaleString()} in pool · ${(enrolled ?? 0).toLocaleString()} enrolled in campaigns`}>
        {canWrite(s.role) && (
          <Link href="/candidates/import" className={buttonVariants()}>Import CSV</Link>
        )}
      </PageHeader>

      <div className="p-8 space-y-4">
        <form className="flex gap-2.5 items-center" method="get">
          <label htmlFor="q" className="sr-only">Search candidates</label>
          <Input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Search name, email, company, title…" className="w-[300px] bg-white" />
          <label htmlFor="market" className="text-xs text-muted-foreground">Market status</label>
          <select id="market" name="market" defaultValue={sp.market ?? ""} className="border rounded-md px-2.5 py-2 bg-white text-sm">
            <option value="">All</option>
            {MARKET_OPTIONS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
          {campaigns && campaigns.length > 0 && (
            <>
              <label htmlFor="campaign" className="text-xs text-muted-foreground">Campaign</label>
              <select id="campaign" name="campaign" defaultValue={sp.campaign ?? ""} className="border rounded-md px-2.5 py-2 bg-white text-sm">
                <option value="">All</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          <Button type="submit" variant="outline">Filter</Button>
          <div className="flex-1" />
          <div className="text-xs text-muted-foreground">Showing {(rows?.length ?? 0) === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + (rows?.length ?? 0)} of {(count ?? 0).toLocaleString()}</div>
        </form>

        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[minmax(240px,1.6fr)_130px_150px_140px_120px_170px] gap-3 px-5 py-3 bg-[#F7F5EF] border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <div>Candidate</div><div>Market status</div><div>Conversation</div><div>Expected timing</div><div>Last verified</div><div>Next action</div>
          </div>
          {(rows ?? []).length === 0 && (
            <div className="px-5 py-10 text-sm text-muted-foreground text-center">
              No candidates yet. {canWrite(s.role) && <Link href="/candidates/import" className="text-primary font-semibold">Import a CSV</Link>} to get started.
            </div>
          )}
          {(rows ?? []).map((r) => (
            <Link key={r.id} href={`/candidates/${r.id}`} className="grid grid-cols-[minmax(240px,1.6fr)_130px_150px_140px_120px_170px] gap-3 items-center px-5 py-3 border-b last:border-0 text-[13px] hover:bg-[#FFF8F2]">
              <div className="min-w-0">
                <div className="font-semibold truncate">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{[r.current_title, r.current_company, r.location].filter(Boolean).join(" · ")}</div>
              </div>
              <div><MarketBadge status={r.market_status} /></div>
              <div className="text-xs text-muted-foreground">{commLabel(r.communication_status)}</div>
              <div>{formatAvailability(r.availability_date, r.availability_precision)}</div>
              <div className="text-xs text-muted-foreground">{formatDate(r.last_verified_at)}</div>
              <div className="text-xs">{nextActions.get(r.id) ?? "—"}</div>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PageLink page={page - 1} disabled={page <= 1} sp={sp}>Previous</PageLink>
          <span>Page {page} of {pages}</span>
          <PageLink page={page + 1} disabled={page >= pages} sp={sp}>Next</PageLink>
        </div>
      </div>
    </>
  );
}

function PageLink({ page, disabled, sp, children }: { page: number; disabled: boolean; sp: Record<string, string | undefined>; children: React.ReactNode }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
  params.set("page", String(page));
  if (disabled) return <span className="px-3 py-1.5 border rounded-md bg-white opacity-50">{children}</span>;
  return <Link href={`/candidates?${params}`} className="px-3 py-1.5 border rounded-md bg-white hover:bg-[#F7F5EF]">{children}</Link>;
}

async function loadNextActions(db: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from("scheduled_actions")
    .select("candidate_id, action_type, scheduled_for")
    .in("candidate_id", ids)
    .eq("status", "PENDING")
    .order("scheduled_for");
  for (const a of data ?? []) {
    if (!map.has(a.candidate_id)) map.set(a.candidate_id, `${actionLabel(a.action_type)} · ${formatDate(a.scheduled_for)}`);
  }
  return map;
}

function actionLabel(t: string) {
  return ({
    SEND_INITIAL: "Initial email", SEND_FOLLOW_UP: "Follow-up", SEND_FINAL: "Final email", SEND_NURTURE: "Nurture",
    SEND_REPLY: "AI reply", RECONNECT: "Reconnect", REFRESH_PROFILE: "Refresh", HUMAN_REVIEW: "Human review",
  } as Record<string, string>)[t] ?? t;
}
