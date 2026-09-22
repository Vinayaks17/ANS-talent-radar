import "server-only";
import type { Db } from "@/lib/db";

export type DashboardData = {
  total: number;
  byMarket: Record<string, number>;
  verifiedPct: number;
  repliesThisWeek: number;
  repliesByMarket: Record<string, number>;
  futureAvailability: { month: string; count: number }[];
  openReview: number;
  flaggedReview: number;
  lowConfidenceReview: number;
  sentToday: number;
  dailyCap: number;
  activeCampaigns: number;
  outreachPaused: boolean;
};

export async function loadDashboard(db: Db, orgId: string): Promise<DashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const verifiedCutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);

  const [cands, verified, replies, review, sent, campaigns, settings] = await Promise.all([
    db.from("candidates").select("market_status, availability_date, availability_precision, last_replied_at").eq("org_id", orgId),
    db.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("last_verified_at", verifiedCutoff),
    db.from("messages").select("candidate_id").eq("org_id", orgId).eq("direction", "INBOUND").gte("received_at", weekAgo),
    db.from("review_items").select("category").eq("org_id", orgId).eq("status", "OPEN"),
    db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "OUTBOUND").gte("sent_at", startOfDay.toISOString()),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "ACTIVE"),
    db.from("org_settings").select("max_outreach_per_day, outreach_paused").eq("org_id", orgId).maybeSingle(),
  ]);

  const rows = cands.data ?? [];
  const byMarket: Record<string, number> = {};
  for (const r of rows) byMarket[r.market_status] = (byMarket[r.market_status] ?? 0) + 1;

  // Future availability: candidates with a known availability month in the next 6 months
  const months: { key: string; month: string; count: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 + i, 1));
    months.push({ key: d.toISOString().slice(0, 7), month: d.toLocaleString("en", { month: "short", timeZone: "UTC" }), count: 0 });
  }
  for (const r of rows) {
    if (!r.availability_date) continue;
    const key = String(r.availability_date).slice(0, 7);
    const m = months.find((x) => x.key === key);
    if (m) m.count++;
  }

  // Replies this week, bucketed by the candidate's current market status
  const replied = new Set((replies.data ?? []).map((r) => r.candidate_id));
  const repliesByMarket: Record<string, number> = {};
  if (replied.size > 0) {
    const { data } = await db.from("candidates").select("id, market_status").in("id", [...replied]);
    for (const r of data ?? []) repliesByMarket[r.market_status] = (repliesByMarket[r.market_status] ?? 0) + 1;
  }

  const reviewRows = review.data ?? [];
  const flagged = reviewRows.filter((r) => !["DRAFT_APPROVAL", "LOW_CONFIDENCE"].includes(r.category)).length;
  const lowConf = reviewRows.filter((r) => r.category === "LOW_CONFIDENCE").length;

  return {
    total: rows.length,
    byMarket,
    verifiedPct: rows.length ? Math.round(((verified.count ?? 0) / rows.length) * 100) : 0,
    repliesThisWeek: (replies.data ?? []).length,
    repliesByMarket,
    futureAvailability: months.map(({ month, count }) => ({ month, count })),
    openReview: reviewRows.length,
    flaggedReview: flagged,
    lowConfidenceReview: lowConf,
    sentToday: sent.count ?? 0,
    dailyCap: settings.data?.max_outreach_per_day ?? 0,
    activeCampaigns: campaigns.count ?? 0,
    outreachPaused: settings.data?.outreach_paused ?? false,
  };
}
