/**
 * Run the system health check from the command line.
 *   npm run health                         → print status for every org
 *   npm run health -- --org ans-rpo --email a@x.com,b@y.com
 *                                          → also email those people if a check fails
 *   add --always to email even when everything is ok (for testing the email)
 * Same email as the daily cron digest; useful until alert_emails (migration 0011) is applied.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  process.env.CRON_SECRET ??= "x".repeat(20);
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { computeHealth } = await import("../src/lib/health");
  const { healthEmailText } = await import("../src/lib/health-digest");
  const { resend } = await import("../src/lib/email/resend");
  const { PRODUCT } = await import("../src/lib/product");
  const slug = arg("org");
  const to = (arg("email") ?? "").split(/[,\s]+/).filter((e) => /@/.test(e));
  const always = process.argv.includes("--always");

  let q = db.from("orgs").select("id, name, slug");
  if (slug) q = q.eq("slug", slug);
  const { data: orgs, error } = await q;
  if (error) throw error;
  if (!orgs?.length) throw new Error(`no org${slug ? ` with slug ${slug}` : ""}`);

  for (const org of orgs) {
    const now = new Date();
    const h = await computeHealth(db, org.id, now);
    console.log(`${org.name} (${org.slug}): ${h.status}`);
    for (const c of h.checks) console.log(`  ${c.status.padEnd(5)} ${c.label}: ${c.detail}`);
    if (!to.length || (h.status === "ok" && !always)) continue;
    const { data: sender } = await db.from("senders").select("email").eq("org_id", org.id).neq("status", "PAUSED").limit(1).maybeSingle();
    if (!sender) { console.log("  no sender to email from"); continue; }
    const label = h.status === "ok" ? "all checks ok" : h.status === "error" ? "action needed" : "health warning";
    const { error: sendErr } = await resend().emails.send({
      from: `${PRODUCT.name} Alerts <alerts@${sender.email.split("@")[1]}>`, to,
      subject: `${PRODUCT.name}: ${label} (${org.name})`,
      text: h.status === "ok" ? `${PRODUCT.name} health check for ${org.name}: all checks ok.\n\n${h.checks.map((c) => `- ${c.label}: ${c.detail}`).join("\n")}` : healthEmailText(org.name, h, process.env.APP_URL ?? ""),
    }, { idempotencyKey: `health-cli-${org.id}-${now.toISOString().slice(0, 10)}-${h.status}` });
    console.log(`  ${sendErr ? `send failed: ${sendErr.message}` : `emailed ${to.join(", ")}`}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
