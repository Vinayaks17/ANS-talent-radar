import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | null = null;
export function resend() {
  if (!client) client = new Resend(env().RESEND_API_KEY);
  return client;
}

export type OutboundEmail = {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
  tags?: Record<string, string>;
  inReplyTo?: string | null;
};

/** Plain-text send with the headers Gmail/Yahoo bulk-sender rules require. */
export async function sendEmail(m: OutboundEmail): Promise<{ id: string }> {
  if (process.env.EMAIL_DRY_RUN === "1") {
    console.log(`[dry-run] ${m.fromEmail} → ${m.to} | ${m.subject}`);
    return { id: `dry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${m.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (m.inReplyTo) {
    headers["In-Reply-To"] = m.inReplyTo;
    headers["References"] = m.inReplyTo;
  }
  const { data, error } = await resend().emails.send({
    from: `${m.fromName.replace(/[<>"]/g, "")} <${m.fromEmail}>`,
    to: [m.to],
    replyTo: m.replyTo,
    subject: m.subject,
    text: m.text,
    headers,
    tags: Object.entries(m.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^a-zA-Z0-9_-]/g, "_") })),
  });
  if (error || !data) throw new Error(`resend send failed: ${error?.message ?? "no id"}`);
  return { id: data.id };
}

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  received_for?: string[];
  reply_to?: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  message_id: string;
  created_at: string;
  attachments: { id: string; filename: string; content_type: string; size: number }[];
};

export async function getReceivedEmail(id: string): Promise<ReceivedEmail> {
  const { data, error } = await resend().emails.receiving.get(id);
  if (error || !data) throw new Error(`resend receiving.get failed: ${error?.message ?? "no data"}`);
  const d = data as unknown as ReceivedEmail & { headers?: unknown };
  const headers: Record<string, string> = {};
  const raw = d.headers;
  if (Array.isArray(raw)) for (const h of raw as { name: string; value: string }[]) headers[h.name.toLowerCase()] = h.value;
  else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, string>)) headers[k.toLowerCase()] = String(v);
  return { ...d, headers, attachments: d.attachments ?? [] };
}

/** Parse "Name <addr>" or bare addr into a lower-cased address. */
export function extractAddress(v: string | null | undefined) {
  if (!v) return null;
  const m = v.match(/<([^>]+)>/);
  return (m ? m[1] : v).trim().toLowerCase() || null;
}
