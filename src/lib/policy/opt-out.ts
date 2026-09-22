/**
 * Rule-based opt-out detection. Runs BEFORE any AI call. Any hit suppresses
 * immediately with no confidence threshold (concept doc §17, §25).
 */
const PHRASES = [
  "unsubscribe",
  "remove me",
  "take me off",
  "don't contact me",
  "do not contact",
  "dont contact me",
  "stop emailing",
  "stop contacting",
  "no more emails",
  "not interested in receiving",
  "opt out",
  "opt-out",
  "cease and desist",
  "delete my data",
  "delete my information",
  "gdpr",
];

const QUOTE_MARKERS = [/^\s*>/m, /^On .+ wrote:$/m, /^From: .+$/m, /^-+ ?Original Message ?-+$/im];

/** Strip quoted history so an old "unsubscribe" in a thread does not retrigger. */
export function replyOnly(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

export function detectOptOut(text: string): { optOut: boolean; phrase?: string } {
  const body = replyOnly(text).toLowerCase().replace(/[’']/g, "'");
  for (const p of PHRASES) {
    if (body.includes(p)) return { optOut: true, phrase: p };
  }
  return { optOut: false };
}
