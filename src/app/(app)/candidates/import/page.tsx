import { getSession, canWrite } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import candidates" };

export default async function ImportPage() {
  const s = await getSession();
  if (!canWrite(s.role)) redirect("/candidates");
  return (
    <>
      <PageHeader title="Import candidates" subtitle="CSV · deduplicated on email, then phone, then LinkedIn · suppressed addresses are never enrolled" />
      <div className="p-8 max-w-4xl">
        <ImportWizard />
      </div>
    </>
  );
}
