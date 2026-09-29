import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Requirements" };

const STATUS_CLS: Record<string, string> = { OPEN: "bg-[#DCEFE3] text-[#14532D]", ON_HOLD: "bg-[#FCE8D2] text-[#7C3A00]", CLOSED: "bg-[#EEE] text-[#4B5563]" };

export default async function RequirementsPage() {
  const s = await getSession();
  const db = await createClient();
  const { data: settings } = await db.from("org_settings").select("matching_enabled").eq("org_id", s.orgId).single();
  if (!settings?.matching_enabled) redirect("/");

  const { data: reqs } = await db.from("requirements").select("id, title, client_name, location, remote_policy, status, last_matched_at, created_at").eq("org_id", s.orgId).order("created_at", { ascending: false });
  const ids = (reqs ?? []).map((r) => r.id);
  const counts = new Map<string, { strong: number; shortlisted: number }>();
  if (ids.length) {
    const { data: m } = await db.from("requirement_matches").select("requirement_id, match_score, status").in("requirement_id", ids);
    for (const x of m ?? []) {
      const c = counts.get(x.requirement_id) ?? { strong: 0, shortlisted: 0 };
      if (x.match_score >= 70 && x.status !== "REJECTED") c.strong++;
      if (x.status === "SHORTLISTED") c.shortlisted++;
      counts.set(x.requirement_id, c);
    }
  }

  return (
    <>
      <PageHeader title="Requirements" subtitle="Open roles matched against the candidate pool · Role fit × Market readiness">
        {canWrite(s.role) && <Link href="/requirements/new" className={buttonVariants()}>New requirement</Link>}
      </PageHeader>
      <div className="p-8">
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[minmax(260px,2fr)_1fr_110px_120px_120px_140px] gap-3 px-5 py-3 bg-[#F7F5EF] border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <div>Role</div><div>Location</div><div>Status</div><div>Strong matches</div><div>Shortlisted</div><div>Last matched</div>
          </div>
          {(reqs ?? []).length === 0 && <div className="px-5 py-10 text-sm text-muted-foreground text-center">No requirements yet. Add one to see who in the pool fits and is ready to move.</div>}
          {(reqs ?? []).map((r) => (
            <Link key={r.id} href={`/requirements/${r.id}`} className="grid grid-cols-[minmax(260px,2fr)_1fr_110px_120px_120px_140px] gap-3 items-center px-5 py-3 border-b last:border-0 text-[13px] hover:bg-[#FFF8F2]">
              <div className="min-w-0"><div className="font-semibold truncate">{r.title}</div><div className="text-xs text-muted-foreground truncate">{r.client_name ?? "—"}</div></div>
              <div className="text-xs text-muted-foreground truncate">{[r.location, r.remote_policy].filter(Boolean).join(" · ") || "—"}</div>
              <div><span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${STATUS_CLS[r.status]}`}>{r.status.replace("_", " ").toLowerCase()}</span></div>
              <div className="font-semibold">{counts.get(r.id)?.strong ?? 0}</div>
              <div className="font-semibold">{counts.get(r.id)?.shortlisted ?? 0}</div>
              <div className="text-xs text-muted-foreground">{r.last_matched_at ? formatDate(r.last_matched_at) : "not yet"}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
