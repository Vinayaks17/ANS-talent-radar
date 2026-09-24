import { z } from "zod";

/**
 * Structured outputs. Each has a zod schema (runtime validation of what the
 * model returns — rule: validate at every boundary) and a hand-written JSON
 * schema for OpenAI strict mode (every property required, nulls explicit).
 */

export const INTENTS = [
  "INTERESTED_NOW", "OPEN_TO_RIGHT_ROLE", "AVAILABLE_LATER", "NOT_LOOKING", "NOT_INTERESTED",
  "OPT_OUT", "QUESTION", "REFERRAL", "OUT_OF_OFFICE", "WRONG_PERSON", "OTHER",
] as const;
export const MARKET_STATUSES = ["AVAILABLE_NOW", "OPEN_TO_RIGHT_OPPORTUNITY", "OPEN_LATER", "PASSIVE", "NOT_LOOKING", "NOT_INTERESTED", "UNKNOWN"] as const;
export const PRECISIONS = ["DAY", "WEEK", "MONTH", "MONTH_APPROXIMATE", "QUARTER", "YEAR"] as const;
export const FACT_TYPES = [
  "AVAILABILITY", "TARGET_COMPENSATION", "CURRENT_COMPENSATION", "PREFERRED_ROLES", "PREFERRED_LOCATIONS",
  "REMOTE_PREFERENCE", "NOTICE_PERIOD", "SKILLS", "CURRENT_EMPLOYER", "CURRENT_TITLE", "RELOCATION", "CONTACT_PREFERENCE", "OTHER",
] as const;
export const REVIEW_FLAGS = [
  "COMPLAINT", "LEGAL_PRIVACY", "ANGRY", "DISCRIMINATION", "COMP_NEGOTIATION", "OFFER_DISCUSSION",
  "CLIENT_CONFLICT", "EXISTING_PROCESS", "UNCLEAR_IDENTITY", "SENSITIVE_INFO",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const classificationSchema = z.object({
  intent: z.enum(INTENTS),
  market_status: z.enum(MARKET_STATUSES),
  opt_out: z.boolean(),
  availability: z.object({ date: isoDate, precision: z.enum(PRECISIONS), quote: z.string() }).nullable(),
  reconnect_after: isoDate.nullable(),
  facts: z.array(z.object({
    type: z.enum(FACT_TYPES),
    value: z.string().max(300),
    quote: z.string().max(500),
    confidence: z.number().min(0).max(1),
    currency: z.string().nullable(),
    amount: z.number().nullable(),
    is_minimum: z.boolean().nullable(),
    items: z.array(z.string()).nullable(),
  })).max(20),
  review_flags: z.array(z.enum(REVIEW_FLAGS)),
  needs_reply: z.boolean(),
  reply_goal: z.string().nullable(),
  summary: z.string().max(400),
  memory: z.string().max(1200),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof classificationSchema>;

const str = { type: "string" } as const;
const nullable = (t: string) => ({ type: [t, "null"] });
const enumOf = (v: readonly string[]) => ({ type: "string", enum: [...v] });
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });

export const classificationJsonSchema = obj({
  intent: enumOf(INTENTS),
  market_status: enumOf(MARKET_STATUSES),
  opt_out: { type: "boolean" },
  availability: { anyOf: [obj({ date: str, precision: enumOf(PRECISIONS), quote: str }), { type: "null" }] },
  reconnect_after: nullable("string"),
  facts: {
    type: "array",
    items: obj({
      type: enumOf(FACT_TYPES), value: str, quote: str, confidence: { type: "number" },
      currency: nullable("string"), amount: nullable("number"), is_minimum: nullable("boolean"),
      items: { anyOf: [{ type: "array", items: str }, { type: "null" }] },
    }),
  },
  review_flags: { type: "array", items: enumOf(REVIEW_FLAGS) },
  needs_reply: { type: "boolean" },
  reply_goal: nullable("string"),
  summary: str,
  memory: str,
  confidence: { type: "number" },
});

export const emailDraftSchema = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(4000) });
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export const emailDraftJsonSchema = obj({ subject: str, body: str });
