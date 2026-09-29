import { redirect } from "next/navigation";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { RequirementForm } from "./requirement-form";

export const metadata = { title: "New requirement" };

export default async function NewRequirementPage() {
  const s = await getSession();
  if (!canWrite(s.role)) redirect("/requirements");
  const db = await createClient();
  const { data } = await db.from("org_settings").select("matching_enabled").eq("org_id", s.orgId).single();
  if (!data?.matching_enabled) redirect("/");
  return (
    <>
      <PageHeader title="New requirement" subtitle="The more specific the must-haves, the better the ranking" />
      <div className="p-8 max-w-[860px]"><RequirementForm /></div>
    </>
  );
}
