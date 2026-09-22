/**
 * Default sequence (concept doc §26): three emails, then stop. Nurture only
 * for non-responders after the recontact interval. Follow-ups stay plain
 * templates; the first touch can be AI-written once the AI layer ships.
 */
export const DEFAULT_STEPS = [
  {
    step_number: 1, delay_days: 0, message_type: "INITIAL" as const, use_ai: false,
    template_subject: "Quick question, {{first_name}}",
    template_body:
      "Hi {{first_name}},\n\nI'm {{sender_name}} with {{org_name}} — we work with firms in {{sector}}. I'm not writing about a specific vacancy; I'm mapping who in your field might be open to a move over the next year.\n\nAre you open to opportunities right now? If not, is there a better time for me to check back?\n\nEither answer helps — thanks.\n\n{{sender_name}}\n{{org_name}}",
  },
  {
    step_number: 2, delay_days: 4, message_type: "FOLLOW_UP" as const, use_ai: false,
    template_subject: "Re: Quick question, {{first_name}}",
    template_body:
      "Hi {{first_name}},\n\nJust closing the loop on my earlier note. Even if you're not considering anything now, I'm happy to reconnect later if there's a better time.\n\n{{sender_name}}\n{{org_name}}",
  },
  {
    step_number: 3, delay_days: 7, message_type: "FINAL" as const, use_ai: false,
    template_subject: "Re: Quick question, {{first_name}}",
    template_body:
      "Hi {{first_name}},\n\nI'll leave it here for now. If your situation changes later, feel free to reach out — I'd be glad to talk.\n\n{{sender_name}}\n{{org_name}}",
  },
  {
    step_number: 4, delay_days: 90, message_type: "NURTURE" as const, use_ai: false,
    template_subject: "Checking in, {{first_name}}",
    template_body:
      "Hi {{first_name}},\n\nIt's been a few months since I last reached out. Is now a better time to talk about what you'd want in your next role — or should I check back later in the year?\n\n{{sender_name}}\n{{org_name}}",
  },
];

export type MergeVars = {
  first_name?: string | null;
  last_name?: string | null;
  sender_name: string;
  org_name: string;
  sector?: string | null;
  current_company?: string | null;
  current_title?: string | null;
};

export function merge(template: string, vars: MergeVars) {
  const v: Record<string, string> = {
    first_name: vars.first_name?.trim() || "there",
    last_name: vars.last_name ?? "",
    sender_name: vars.sender_name,
    org_name: vars.org_name,
    sector: vars.sector ?? "your industry",
    current_company: vars.current_company ?? "",
    current_title: vars.current_title ?? "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k] ?? "");
}
