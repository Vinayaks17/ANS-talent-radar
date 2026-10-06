import "server-only";
import type { Db } from "@/lib/db";
import { env } from "@/lib/env";
import { resend } from "@/lib/email/resend";
import { computeHealth, type Health } from "@/lib/health";
import { PRODUCT } from "@/lib/product";

/** Plain-text alert body. Exported for tests. */
export function healthEmailText(orgName: string, h: Health, appUrl: string) {
  const bad = h.checks.filter((c) => c.status !== "ok");
  const lines = [
    `${PRODUCT.name} health check for ${orgName}: ${h.status === "error" ? "action needed" : "needs a look"}.`,
    "",
    ...bad.map((c) => `- ${c.status === "error" ? "PROBLEM" : "Warning"} · ${c.label}: ${c.detail}`),
    "",
    `Dashboard: ${appUrl}/`,
    "",
    "You get this email only when a check fails. Change who receives it under Settings → Health alerts.",
  ];
  return lines.join("\n");
}

/**
 * Once a day (03:00 UTC cron run): for every org with alert recipients, send
 * one email if any health check is failing. Idempotent per org per day, so
 * the pg_cron run and the Vercel fallback can both fire without duplicates.
 */
export async function sendHealthDigests(db: Db, now = new Date()) {
  const { data: rows, error } = await db.from("org_settings").select("org_id, alert_emails");
  if (error) return [`skipped: ${error.message}`]; // e.g. migration 0011 not applied yet
  const out: string[] = [];
  for (const r of rows ?? []) {
    const to = (r.alert_emails ?? []).filter((e) => /@/.test(e));
    if (!to.length) continue;
    const h = await computeHealth(db, r.org_id, now);
    if (h.status === "ok") { out.push(`${r.org_id.slice(0, 8)}: ok`); continue; }
    const [{ data: org }, { data: sender }] = await Promise.all([
      db.from("orgs").select("name").eq("id", r.org_id).single(),
      db.from("senders").select("email").eq("org_id", r.org_id).neq("status", "PAUSED").limit(1).maybeSingle(),
    ]);
    if (!sender) { out.push(`${r.org_id.slice(0, 8)}: no verified sender domain to send from`); continue; }
    const from = `${PRODUCT.name} Alerts <alerts@${sender.email.split("@")[1]}>`;
    const { error: sendErr } = await resend().emails.send({
      from, to, subject: `${PRODUCT.name}: ${h.status === "error" ? "action needed" : "health warning"} (${org?.name ?? "your workspace"})`,
      text: healthEmailText(org?.name ?? "your workspace", h, env().APP_URL),
    }, { idempotencyKey: `health-${r.org_id}-${now.toISOString().slice(0, 10)}` });
    out.push(`${r.org_id.slice(0, 8)}: ${h.status} → ${sendErr ? `send failed: ${sendErr.message}` : `emailed ${to.length}`}`);
  }
  return out;
}
