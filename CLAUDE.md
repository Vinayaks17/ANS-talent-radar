@AGENTS.md

# Talent Radar — engineering rules

Talent Radar is a multi-tenant candidate-nurturing product: it emails a pool of
candidates on a schedule, reads their replies with an LLM, stores structured
facts with provenance, replies when safe, and schedules reconnects. ANS RPO is
tenant #1; the product will be sold to other staffing firms.

## Stack

Next.js 16 (App Router, Turbopack, `src/proxy.ts` not middleware), TypeScript
strict, Tailwind v4 + shadcn/ui, Supabase (Postgres, Auth, Storage) via
`@supabase/ssr` + `@supabase/supabase-js`, Resend (outbound + inbound
webhooks), OpenAI Responses API, Vercel (hosting + cron). No ORM: SQL
migrations in `supabase/migrations`, typed access through supabase-js.

## Non-negotiable design rules

1. **AI recommends, code decides.** The LLM only understands, writes,
   summarises and recommends. Every decision (send, schedule, suppress,
   status change) goes through a deterministic function in `src/lib/policy/`.
2. **The AI never writes to `suppressions`.** Only humans and the
   bounce/complaint webhook insert there. Every outbound path checks
   suppression first, eligibility second, limits third — before generating a
   message.
3. **Opt-outs bypass confidence thresholds.** Rule-based detection runs before
   the classifier; either can suppress immediately.
4. **Multi-tenant from day one.** Every table has `org_id`; every RLS policy is
   keyed to it; every query goes through a client scoped to the caller's org.
   Never hard-code "ANS" — name, colours, senders come from `orgs`/settings.
5. **Secrets never enter the repo.** `.env*` is gitignored; `.env.example`
   lists names only. Service-role/secret keys are used only in server code
   under `src/lib/supabase/admin.ts` and route handlers.
6. **Every automated decision is logged** to `audit_events` with actor
   (SYSTEM / AI / USER), model, prompt version, input/output refs, decision
   and reason.
7. **Prompts live in the database** (`prompt_templates`, versioned), not in
   source. Model choice per action lives in `org_settings` (default Luna).
8. **Idempotent workers.** `scheduled_actions` rows are claimed with
   `FOR UPDATE SKIP LOCKED` via an RPC; webhooks store the raw event, dedupe
   on provider id, return 200, then process.

## Conventions

- Server Components by default; `"use client"` only for interactivity.
- Server Actions for mutations from the UI; Route Handlers only for cron,
  webhooks and downloads. Both re-check auth and org membership.
- Dates: store `timestamptz`; candidate-facing times in the candidate's
  time zone; approximate dates keep their precision
  (`availability_precision`).
- Validation with zod at every boundary (env, CSV rows, LLM JSON, webhooks).
- Money: integer minor units + ISO currency.
- Tests: vitest for policy functions and parsers; the reply test suite in
  `tests/replies/` runs against the classifier before any prompt change ships.
- Commit small; one branch per chunk; `main` auto-deploys to Vercel.

## Next 16 gotchas (verified against bundled docs)

- `cookies()`, `headers()`, `params`, `searchParams` are async. Always await.
- `src/proxy.ts` exports `proxy(request)`; exclude `/api` from its matcher so
  webhook bodies are not buffered.
- `revalidateTag(tag, 'max')` (two args). `updateTag` only in Server Actions.
- `cacheComponents` is OFF. Do not add `dynamic`/`revalidate` exports unless
  needed; cron handlers must read `request.headers` so they stay dynamic.
- `next lint` is gone; run `npm run lint` (eslint flat config).
