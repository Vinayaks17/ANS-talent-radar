import "server-only";
import type { Db } from "@/lib/db";
import { monthSpend } from "@/lib/ai/client";

export type HealthStatus = "ok" | "warn" | "error";
export type HealthCheck = { key: string; label: string; status: HealthStatus; detail: string };
export type Health = { status: HealthStatus; checks: HealthCheck[]; checkedAt: string };

const H = 3600000;
const worst = (a: HealthStatus, b: HealthStatus): HealthStatus => (a === "error" || b === "error" ? "error" : a === "warn" || b === "warn" ? "warn" : "ok");

/**
 * Is the machine running? Derived from data we already store, so it needs no
 * extra tables: overdue work means the dispatcher stopped; sends without any
 * webhook traffic means replies aren't reaching us; bounce and complaint rates
 * protect the sending domain; AI fallbacks and budget show the AI layer.
 */
export async function computeHealth(db: Db, orgId: string, now = new Date()): Promise<Health> {
  const t = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const [overdue, stuck, failed, sent24, inbound24, inboundErr, sent7, bounced7, complained7, aiFallback, settings] = await Promise.all([
    db.from("scheduled_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "PENDING").lt("scheduled_for", t(0.5 * H)),
    db.from("scheduled_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "PROCESSING").lt("locked_at", t(0.5 * H)),
    db.from("scheduled_actions").select("id, last_error", { count: "exact" }).eq("org_id", orgId).eq("status", "FAILED").gte("created_at", t(7 * 24 * H)).limit(3),
    db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "OUTBOUND").gte("sent_at", t(24 * H)),
    db.from("inbound_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("received_at", t(24 * H)),
    db.from("inbound_events").select("id, error", { count: "exact" }).eq("org_id", orgId).not("error", "is", null).gte("received_at", t(24 * H)).limit(3),
    db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "OUTBOUND").gte("sent_at", t(7 * 24 * H)),
    db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "OUTBOUND").eq("delivery_status", "BOUNCED").gte("sent_at", t(7 * 24 * H)),
    db.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("direction", "OUTBOUND").eq("delivery_status", "COMPLAINED").gte("sent_at", t(7 * 24 * H)),
    db.from("audit_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("event_type", "REPLY_RECEIVED").gte("created_at", t(24 * H)),
    db.from("org_settings").select("outreach_paused, ai_enabled, ai_monthly_budget_usd").eq("org_id", orgId).maybeSingle(),
  ]);
  const checks: HealthCheck[] = [];

  const late = (overdue.count ?? 0) + (stuck.count ?? 0);
  checks.push(late
    ? { key: "dispatcher", label: "Sending engine", status: "error", detail: `${late} scheduled action${late === 1 ? " is" : "s are"} over 30 min late — the 5-minute dispatcher may have stopped` }
    : { key: "dispatcher", label: "Sending engine", status: "ok", detail: settings.data?.outreach_paused ? "Running (outreach is paused)" : "Running on schedule" });

  const nFailed = failed.count ?? 0;
  checks.push(nFailed
    ? { key: "failed", label: "Failed sends", status: "warn", detail: `${nFailed} action${nFailed === 1 ? "" : "s"} failed after retries this week${failed.data?.[0]?.last_error ? ` — e.g. "${failed.data[0].last_error.slice(0, 80)}"` : ""}` }
    : { key: "failed", label: "Failed sends", status: "ok", detail: "None this week" });

  const nErr = inboundErr.count ?? 0;
  const silent = (sent24.count ?? 0) > 0 && (inbound24.count ?? 0) === 0;
  checks.push(silent
    ? { key: "webhook", label: "Replies & delivery updates", status: "error", detail: `${sent24.count} emails sent in 24h but no updates from Resend — the webhook may be broken, so replies wouldn't arrive` }
    : nErr
      ? { key: "webhook", label: "Replies & delivery updates", status: "warn", detail: `${nErr} webhook event${nErr === 1 ? "" : "s"} failed to process in 24h${inboundErr.data?.[0]?.error ? ` — "${inboundErr.data[0].error.slice(0, 80)}"` : ""}` }
      : { key: "webhook", label: "Replies & delivery updates", status: "ok", detail: (inbound24.count ?? 0) ? `${inbound24.count} updates received in 24h` : "No traffic in 24h (nothing sent)" });

  const s7 = sent7.count ?? 0, b7 = bounced7.count ?? 0, c7 = complained7.count ?? 0;
  const rate = s7 ? b7 / s7 : 0;
  checks.push(c7
    ? { key: "reputation", label: "Sender reputation", status: "error", detail: `${c7} spam complaint${c7 === 1 ? "" : "s"} this week — review the list and copy before sending more` }
    : rate > 0.05 && b7 >= 2
      ? { key: "reputation", label: "Sender reputation", status: "error", detail: `Bounce rate ${(rate * 100).toFixed(1)}% this week (${b7}/${s7}) — clean the list; providers start filtering above ~5%` }
      : rate > 0.02 && b7 >= 2
        ? { key: "reputation", label: "Sender reputation", status: "warn", detail: `Bounce rate ${(rate * 100).toFixed(1)}% this week (${b7}/${s7})` }
        : { key: "reputation", label: "Sender reputation", status: "ok", detail: s7 ? `${b7} bounce${b7 === 1 ? "" : "s"} of ${s7} sent this week, no complaints` : "Nothing sent this week" });

  const spent = await monthSpend(db, orgId);
  const budget = Number(settings.data?.ai_monthly_budget_usd ?? 0);
  const fallbacks = aiFallback.count ?? 0;
  const ai: HealthCheck = !settings.data?.ai_enabled
    ? { key: "ai", label: "AI", status: "warn", detail: "Switched off in Settings — replies go to people, emails use templates" }
    : budget && spent >= budget
      ? { key: "ai", label: "AI", status: "error", detail: `Monthly budget used up ($${spent.toFixed(2)} of $${budget}) — AI paused until next month or a higher budget` }
      : fallbacks
        ? { key: "ai", label: "AI", status: "warn", detail: `${fallbacks} repl${fallbacks === 1 ? "y" : "ies"} in 24h went to people because the AI didn't run` }
        : budget && spent >= 0.8 * budget
          ? { key: "ai", label: "AI", status: "warn", detail: `$${spent.toFixed(2)} of $${budget} monthly budget used` }
          : { key: "ai", label: "AI", status: "ok", detail: `Working · $${spent.toFixed(2)} spent this month${budget ? ` of $${budget}` : ""}` };
  checks.push(ai);

  return { status: checks.reduce<HealthStatus>((a, c) => worst(a, c.status), "ok"), checks, checkedAt: now.toISOString() };
}
