import Link from "next/link";
import { getSession, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MarketBadge } from "@/components/status-badge";
import { ReviewActions } from "./review-actions";
import { fullName, initials, formatDateTime } from "@/lib/format";

export const metadata = { title: "Review queue" };

const CAT_CLS: Record<string, string> = {
  REPLY_RECEIVED: "bg-[#DBEAFE] text-[#1E3A8A]", DRAFT_APPROVAL: "bg-[#E8EAF0] text-[#3B4252]", LOW_CONFIDENCE: "bg-[#FCE8D2] text-[#7C3A00]",
};
const catLabel = (c: string) => ({ REPLY_RECEIVED: "Reply received", DRAFT_APPROVAL: "Draft reply", LOW_CONFIDENCE: "Low confidence", COMP_NEGOTIATION: "Comp negotiation", COMPLAINT: "Complaint", LEGAL_PRIVACY: "Legal / privacy" } as Record<string, string>)[c] ?? c.replace(/_/g, " ").toLowerCase();

export default async function ReviewPage(props: { searchParams: Promise<{ item?: string }> }) {
  const { item } = await props.searchParams;
  const s = await getSession();
  const db = await createClient();

  const { data: items } = await db
    .from("review_items")
    .select("id, category, reason, created_at, candidate_id, conversation_id, inbound_message_id, draft_reply, ai_classification, candidates(first_name, last_name, email, current_title, current_company, location, timezone, market_status, memory_summary)")
    .eq("org_id", s.orgId).eq("status", "OPEN").order("created_at");

  const list = items ?? [];
  const selected = list.find((i) => i.id === item) ?? list[0] ?? null;
  const conv = selected?.conversation_id
    ? (await db.from("messages").select("id, direction, from_address, subject, text_body, reply_text, sent_at, received_at, ai_generated, approved_by").eq("conversation_id", selected.conversation_id).order("created_at")).data ?? []
    : [];
  const { data: settings } = await db.from("org_settings").select("approval_required").eq("org_id", s.orgId).single();

  return (
    <>
      <PageHeader title="Review queue" subtitle={`${list.length} waiting`}>
        <div className="px-3 py-1.5 rounded-full bg-[#FCE8D2] text-[#7C3A00] text-xs font-semibold">{settings?.approval_required ? "Auto-reply: approval required" : "Auto-reply: automatic above threshold"}</div>
      </PageHeader>

      <div className="flex-1 flex min-h-0">
        <div className="w-[380px] shrink-0 border-r bg-white overflow-auto">
          {list.length === 0 && <div className="p-6 text-sm text-muted-foreground">Nothing waiting. Replies and flagged items land here.</div>}
          {list.map((i) => {
            const c = i.candidates as unknown as { first_name: string | null; last_name: string | null; email: string; current_title: string | null; current_company: string | null; market_status: string } | null;
            return (
              <Link key={i.id} href={`/review?item=${i.id}`} className={`block px-5 py-3.5 border-b space-y-1.5 ${selected?.id === i.id ? "bg-[#FFF8F2]" : "hover:bg-[#FAF8F3]"}`}>
                <div className="flex items-center gap-2"><div className="text-[13px] font-bold">{c ? fullName(c) : "Unknown"}</div><div className="flex-1" /><div className="text-[11px] text-muted-foreground">{formatDateTime(i.created_at)}</div></div>
                <div className="text-xs text-muted-foreground truncate">{[c?.current_title, c?.current_company].filter(Boolean).join(" · ")}</div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${CAT_CLS[i.category] ?? "bg-[#FBE2E2] text-[#7F1D1D]"}`}>{catLabel(i.category)}</span>
                  {c && <MarketBadge status={c.market_status} className="px-2 py-0.5" />}
                </div>
              </Link>
            );
          })}
        </div>

        {selected ? (() => {
          const c = selected.candidates as unknown as { first_name: string | null; last_name: string | null; email: string; current_title: string | null; current_company: string | null; location: string | null; timezone: string | null; market_status: string; memory_summary: string | null } | null;
          const name = c ? fullName(c) : "Unknown";
          const inbound = conv.filter((m) => m.direction === "INBOUND");
          const latest = inbound[inbound.length - 1];
          return (
            <div className="flex-1 p-8 flex gap-5 min-w-0 overflow-auto">
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white font-heading flex items-center justify-center">{initials(name)}</div>
                  <div><Link href={`/candidates/${selected.candidate_id}`} className="font-bold text-[16px] hover:underline">{name}</Link><div className="text-xs text-muted-foreground">{[c?.current_title, c?.current_company, c?.location, c?.timezone].filter(Boolean).join(" · ")}</div></div>
                  <div className="flex-1" />
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${CAT_CLS[selected.category] ?? "bg-[#FBE2E2] text-[#7F1D1D]"}`}>{catLabel(selected.category)}</span>
                </div>
                {selected.reason && <p className="text-xs text-muted-foreground">{selected.reason}</p>}

                <div className="space-y-2.5">
                  {conv.map((m) => (
                    <div key={m.id} className={`rounded-lg px-4 py-3 space-y-1 ${m.direction === "INBOUND" ? "bg-[#FFF8F2] border border-[#F5D9C0]" : "bg-white border"}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <strong className="text-foreground">{m.direction === "INBOUND" ? name : m.from_address}</strong>
                        <div className="flex-1" />
                        <span>{formatDateTime(m.direction === "INBOUND" ? m.received_at : m.sent_at)}</span>
                        {m.ai_generated && <span className="px-1.5 py-0.5 rounded bg-[#E8EAF0] text-[#3B4252] text-[10px] font-bold">AI-written</span>}
                      </div>
                      {m.subject && m.direction === "OUTBOUND" && <div className="text-[13px] font-semibold">{m.subject}</div>}
                      <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{m.direction === "INBOUND" ? (m.reply_text || m.text_body) : m.text_body}</p>
                    </div>
                  ))}
                </div>

                {canWrite(s.role) && (
                  <ReviewActions itemId={selected.id} candidateId={selected.candidate_id} conversationId={selected.conversation_id} draft={selected.draft_reply ?? ""} subject={latest?.subject ? (latest.subject.startsWith("Re:") ? latest.subject : `Re: ${latest.subject}`) : "Re: your reply"} />
                )}
              </div>

              <div className="w-[300px] shrink-0 space-y-3.5">
                <div className="bg-white border rounded-lg p-4 space-y-2">
                  <h2 className="text-[13px] font-bold">What the AI understood</h2>
                  {selected.ai_classification ? (
                    <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">{JSON.stringify(selected.ai_classification, null, 1)}</pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">Classification is not enabled yet. Read the reply, set the market status on the candidate, and answer or skip.</p>
                  )}
                </div>
                <div className="bg-white border rounded-lg p-4 space-y-2">
                  <h2 className="text-[13px] font-bold">Candidate memory</h2>
                  <p className="text-xs leading-relaxed">{c?.memory_summary ?? "Nothing recorded yet."}</p>
                </div>
              </div>
            </div>
          );
        })() : <div className="flex-1" />}
      </div>
    </>
  );
}
