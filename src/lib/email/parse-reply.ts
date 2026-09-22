/**
 * Turn a raw inbound email into the candidate's own words, and decide whether
 * it is a real reply at all. Pure functions; unit-tested in tests/reply-parse.
 */

const QUOTE_LINE_MARKERS: RegExp[] = [
  /^On .{5,200} wrote:\s*$/m,
  /^On .{5,200}\n.{0,200} wrote:\s*$/m,
  /^From: .+$/m,
  /^-{2,} ?Original Message ?-{2,}$/im,
  /^-{2,} ?Forwarded message ?-{2,}$/im,
  /^Sent from my (iPhone|iPad|Android|Galaxy|Samsung)/im,
  /^Get Outlook for (iOS|Android)/im,
  /^_{5,}\s*$/m,
  /^>/m,
];

const SIGNATURE_MARKERS: RegExp[] = [
  /^-- \s*$/m,
  /^(Best|Kind|Warm) regards,?\s*$/im,
  /^(Regards|Thanks|Thank you|Cheers|Best|Sincerely|Many thanks),?\s*$/im,
];

/** Everything the candidate typed above the quoted history and before the signature. */
export function extractReplyText(text: string): string {
  let body = text.replace(/\r\n/g, "\n");
  let cut = body.length;
  for (const re of QUOTE_LINE_MARKERS) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  body = body.slice(0, cut);

  // Signature: only strip if it leaves something behind.
  let sigCut = body.length;
  for (const re of SIGNATURE_MARKERS) {
    const m = re.exec(body);
    if (m && m.index > 0 && m.index < sigCut) sigCut = m.index;
  }
  const trimmed = body.slice(0, sigCut).trim();
  return (trimmed.length >= 2 ? trimmed : body.trim()).replace(/\n{3,}/g, "\n\n");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n> quoted\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").trim();
}

export type AutoKind = "AUTO_REPLY" | "BOUNCE" | "NONE";

/** Out-of-office, auto-responders and mailer-daemon bounces must never reach the classifier. */
export function detectAutomated(args: { headers: Record<string, string>; from: string; subject: string; text: string }): AutoKind {
  const h = args.headers;
  const from = args.from.toLowerCase();
  const subj = args.subject.toLowerCase();
  if (/mailer-daemon|postmaster@|no-?reply@|donotreply@/.test(from)) return "BOUNCE";
  if (/^(undeliverable|delivery status notification|mail delivery failed|returned mail)/.test(subj)) return "BOUNCE";
  if ((h["auto-submitted"] ?? "").toLowerCase().startsWith("auto")) return "AUTO_REPLY";
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]) return "AUTO_REPLY";
  if (/^(bulk|auto_reply|junk)$/i.test(h["precedence"] ?? "")) return "AUTO_REPLY";
  if (/^(automatic reply|auto: |autoreply|out of (the )?office|ooo:|away from (the )?office)/.test(subj)) return "AUTO_REPLY";
  if (/\b(out of (the )?office|currently away|limited access to email|will (be )?respond(ing)? (when|upon) (my|i) return)\b/i.test(args.text.slice(0, 600))) return "AUTO_REPLY";
  return "NONE";
}

/** Our reply-to addresses look like  local+t_<token>@domain . */
export function threadTokenFromAddresses(addresses: string[]): string | null {
  for (const a of addresses) {
    const m = a.toLowerCase().match(/\+t_([a-z0-9]{8,40})@/);
    if (m) return m[1];
  }
  return null;
}
