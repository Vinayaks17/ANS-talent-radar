import Link from "next/link";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { createCampaign } from "./actions";

export const metadata = { title: "Campaigns" };

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-[#DCEFE3] text-[#14532D]", PAUSED: "bg-[#FCE8D2] text-[#7C3A00]", DRAFT: "bg-[#E8EAF0] text-[#3B4252]", ARCHIVED: "bg-[#EEE] text-[#4B5563]",
};

export default async function CampaignsPage() {
  const s = await getSession();
  const db = await createClient();
  const { data: campaigns } = await db.from("campaigns").select("id, name, status, objective, target_audience, sector, updated_at").eq("org_id", s.orgId).neq("status", "ARCHIVED").order("updated_at", { ascending: false });

  const ids = (campaigns ?? []).map((c) => c.id);
  const stats = new Map<string, { enrolled: number; contacted: number; replied: number }>();
  if (ids.length) {
    const [{ data: enr }, { data: msgs }] = await Promise.all([
      db.from("campaign_enrollments").select("campaign_id, status").in("campaign_id", ids),
      db.from("messages").select("campaign_id, direction, candidate_id").in("campaign_id", ids),
    ]);
    for (const id of ids) stats.set(id, { enrolled: 0, contacted: 0, replied: 0 });
    for (const e of enr ?? []) stats.get(e.campaign_id)!.enrolled++;
    const contacted = new Map<string, Set<string>>(), replied = new Map<string, Set<string>>();
    for (const m of msgs ?? []) {
      if (!m.campaign_id) continue;
      const map = m.direction === "OUTBOUND" ? contacted : replied;
      if (!map.has(m.campaign_id)) map.set(m.campaign_id, new Set());
      map.get(m.campaign_id)!.add(m.candidate_id);
    }
    for (const id of ids) { stats.get(id)!.contacted = contacted.get(id)?.size ?? 0; stats.get(id)!.replied = replied.get(id)?.size ?? 0; }
  }

  return (
    <>
      <PageHeader title="Campaigns" subtitle={`${campaigns?.length ?? 0} campaigns`}>
        {canWrite(s.role) && <form action={createCampaign}><Button type="submit">New campaign</Button></form>}
      </PageHeader>
      <div className="p-8 grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(campaigns ?? []).length === 0 && (
          <div className="col-span-2 bg-white border rounded-xl p-10 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one, set its sequence and senders, activate it, then enrol candidates.
          </div>
        )}
        {(campaigns ?? []).map((c) => {
          const st = stats.get(c.id) ?? { enrolled: 0, contacted: 0, replied: 0 };
          return (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="bg-white border rounded-xl p-5 hover:border-primary/40 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="font-bold text-[15px] flex-1 truncate">{c.name}</div>
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${STATUS_CLS[c.status] ?? ""}`}>{c.status.toLowerCase()}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{[c.target_audience, c.sector].filter(Boolean).join(" · ") || c.objective || "No description yet"}</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><div className="font-heading text-xl">{st.enrolled.toLocaleString()}</div><div className="text-muted-foreground">enrolled</div></div>
                <div><div className="font-heading text-xl">{st.contacted.toLocaleString()}</div><div className="text-muted-foreground">contacted</div></div>
                <div><div className="font-heading text-xl">{st.replied.toLocaleString()} <span className="text-xs font-sans text-muted-foreground">{st.contacted ? Math.round((st.replied / st.contacted) * 100) : 0}%</span></div><div className="text-muted-foreground">replied</div></div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
