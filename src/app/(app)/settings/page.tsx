import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { SendersPanel } from "./senders-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: settings }, { data: senders }, { data: suppressionCounts }] = await Promise.all([
    supabase.from("org_settings").select("*").eq("org_id", s.orgId).single(),
    supabase.from("senders").select("*").eq("org_id", s.orgId).order("created_at"),
    supabase.from("suppressions").select("reason").eq("org_id", s.orgId),
  ]);
  if (!settings) throw new Error("Settings row missing for org");
  const now = Date.now();

  const counts = (suppressionCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Settings" subtitle="System ceilings · campaigns cannot exceed these" />
      <div className="p-8 space-y-5">
        <SettingsForm settings={settings} isAdmin={s.role === "admin"} />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <SendersPanel senders={(senders ?? []).map((x) => ({ ...x, warmup_day: Math.floor((now - new Date(x.warmup_started_at).getTime()) / 86400000) + 1 }))} isAdmin={s.role === "admin"} />
          <Card>
            <CardHeader><CardTitle className="text-sm">Suppression list</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="font-heading text-3xl font-medium">{total.toLocaleString()} <span className="text-sm font-sans text-muted-foreground">addresses</span></div>
              <dl className="text-xs text-muted-foreground space-y-1">
                {(["OPT_OUT", "BOUNCE", "COMPLAINT", "MANUAL", "LEGAL"] as const).map((k) => (
                  <div key={k} className="flex justify-between"><dt>{k.replace("_", " ").toLowerCase()}</dt><dd className="font-semibold text-foreground">{counts[k] ?? 0}</dd></div>
                ))}
              </dl>
              <p className="text-[11px] text-muted-foreground border-t pt-2">The AI has no write access to this list. Only people and bounce/complaint webhooks add to it.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
