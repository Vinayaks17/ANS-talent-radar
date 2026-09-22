import { AppSidebar } from "@/components/app-sidebar";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const supabase = await createClient();

  const [{ count: reviewCount }, { data: settings }] = await Promise.all([
    supabase.from("review_items").select("id", { count: "exact", head: true }).eq("org_id", session.orgId).eq("status", "OPEN"),
    supabase.from("org_settings").select("outreach_paused").eq("org_id", session.orgId).maybeSingle(),
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        orgName={session.orgName}
        logoText={session.brand.logo_text ?? session.orgName.slice(0, 3).toUpperCase()}
        displayName={session.displayName}
        role={session.role}
        reviewCount={reviewCount ?? 0}
        outreachPaused={settings?.outreach_paused ?? false}
        canPause={canWrite(session.role)}
        signOut={signOut}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
