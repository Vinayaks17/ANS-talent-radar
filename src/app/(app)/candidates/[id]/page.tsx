import { PageHeader } from "@/components/page-header";
export default async function Page(props: PageProps<"/candidates/[id]">) {
  const { id } = await props.params;
  return (<><PageHeader title="Candidate" /><div className="p-8 text-sm text-muted-foreground">Profile {id} — coming in this build.</div></>);
}
