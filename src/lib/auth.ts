import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "recruiter" | "viewer";

export type Session = {
  userId: string;
  email: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  brand: { logo_text?: string; primary?: string; accent?: string };
  role: Role;
  displayName: string;
};

/**
 * Resolves the signed-in user and their org membership. Redirects to /login
 * when signed out and to /no-access when the user belongs to no org and
 * cannot self-join by email domain. Cached per request.
 */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, display_name, orgs(name, slug, brand)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // First login: try to self-join an org whose allowed_email_domains matches.
    const { data: joined } = await supabase.rpc("join_org_by_email_domain");
    if (joined && joined.length > 0) {
      const again = await supabase
        .from("org_members")
        .select("org_id, role, display_name, orgs(name, slug, brand)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      membership = again.data;
    }
  }
  if (!membership) redirect("/no-access");

  const org = membership.orgs as unknown as { name: string; slug: string; brand: Session["brand"] } | null;
  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id,
    orgName: org?.name ?? "",
    orgSlug: org?.slug ?? "",
    brand: org?.brand ?? {},
    role: membership.role as Role,
    displayName: membership.display_name ?? user.email?.split("@")[0] ?? "",
  };
});

export function canWrite(role: Role) {
  return role === "admin" || role === "recruiter";
}

export async function requireRole(...roles: Role[]) {
  const s = await getSession();
  if (!roles.includes(s.role)) redirect("/");
  return s;
}
