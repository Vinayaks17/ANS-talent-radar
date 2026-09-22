# Talent Radar — handoff (state as of 23 Sep 2026)

Read `CLAUDE.md` first (rules), then this file (state), then `docs/` if present.

## What exists and works

Verified end to end through the real UI (Playwright) against the dev database,
with email sending stubbed:

- **Auth**: email/password via Supabase Auth. First user from an allow-listed
  domain becomes admin (`orgs.allowed_email_domains`, seeded: ansrpo.com,
  hireecom.com). Others self-join as recruiter. `/no-access` otherwise.
- **Tenancy**: every table has `org_id`; RLS keyed to `org_members`. ANS RPO
  is org `ans`. Settings, senders, brand all per org.
- **Dashboard** `/`: market-status tiles, future-availability chart, replies
  this week, review counts, today's sending vs cap.
- **Candidates** `/candidates`: list/search/filter; `/candidates/import` CSV
  wizard (flexible headers → normalise → dedupe on email→phone→LinkedIn →
  suppression check → preview → commit; existing records get blanks filled,
  never overwritten); `/candidates/[id]` profile: status tiles, memory, facts
  with provenance, timeline, conversation, Suppress, Reconnect now.
- **Campaigns** `/campaigns`: create → 4 default steps (Day 0 initial, +4
  follow-up, +7 final, +90 nurture) → edit copy/limits/window/senders →
  Activate → Enrol (eligibility rules in `src/lib/campaigns/enroll.ts`;
  schedules `SEND_INITIAL` actions spread across sender capacity).
- **Review queue** `/review`: every real reply lands here (AI classification
  not built yet). Set market status, approve a reply (queues `SEND_REPLY`),
  skip, or suppress.
- **Settings** `/settings`: rate limits, send window, AI thresholds, model per
  action (Luna default, Terra for match), human-review categories, senders,
  suppression counts, PAUSE ALL.
- **Workers**: `GET /api/cron/dispatch` (Bearer `CRON_SECRET`) runs
  `processInboundEvents` then `runDispatcher`. See **Schedule** below for what
  calls it.
  Dispatcher order per action: suppression list → eligibility → send window
  (candidate tz) → sender + daily caps → compose → send → record → next step.
  Nothing after a send can throw (no double sends). `POST /api/webhooks/resend`
  verifies svix signature, stores the event, returns 200, processes in
  `after()`. Inbound: plus-token (`local+t_<token>@domain`) → conversation;
  auto-reply/bounce detection; rule-based opt-out → immediate suppression;
  real reply → cancel sequence, `HUMAN_REVIEW`, review item.
- **Unsubscribe**: `List-Unsubscribe` + one-click POST at
  `/api/unsubscribe/[token]`; human page at `/u/[token]`.
- **Tests**: `npm test` (37 unit + integration). Integration needs
  `RUN_INTEGRATION=1` and `.env.local`.

## Environment

- Supabase dev project `talent-radar-dev` ref `hhdtretmidmdfmkopdyj` (us-east-1).
  Migrations: `npm run db:migrate` (needs `SUPABASE_ACCESS_TOKEN`, runs over
  HTTPS via the Management API). Types: `npm run db:types`.
- Test login: `claude-test@ansrpo.com` (password in the session that created it;
  create another admin from the sign-up tab with an @ansrpo.com address).
- Dev org has `outreach_paused = true` on purpose: the sender
  `sushant@talent.ansrpo.com` exists but the domain is not verified in Resend
  yet, so real sends would fail. Resume from Settings once DNS is done.
- `EMAIL_DRY_RUN=1` makes `sendEmail` log instead of calling Resend.

## Schedule (where the cron lives)

Vercel Hobby only allows daily crons, so the 5-minute schedule lives in Supabase:

- **Every 5 min — Supabase pg_cron.** Job `talent-radar-dispatch`
  (`*/5 * * * *`) created by `supabase/migrations/0003_dispatch_schedule.sql`.
  It runs `public.invoke_cron_dispatch()`, which uses pg_net to
  `GET <cron_dispatch_url>` with `Authorization: Bearer <cron_secret>`.
  Both values are in **Supabase Vault** (names `cron_dispatch_url`,
  `cron_secret`), never in the repo. Set or rotate them with
  `npm run db:cron-secrets` (reads `APP_URL` + `CRON_SECRET` from
  `.env.local`). If either secret is missing the job logs a notice and skips.
- **Daily 03:00 UTC — Vercel Cron** (`vercel.json`), a fallback that hits the
  same route with Vercel's own `CRON_SECRET` header.
- `CRON_SECRET` must be identical in Vercel env vars and Vault. Rotating it
  means updating both, then redeploying.
- Inspect: `select * from cron.job;` / `select * from cron.job_run_details
  order by start_time desc limit 20;` / `select * from net._http_response
  order by created desc limit 20;`. Pause: `select cron.unschedule('talent-radar-dispatch');`
  (re-run the migration's `cron.schedule(...)` line to restore).

## Not built yet (in order)

1. **Deploy**: Vercel project `ans-talent-radar` is linked to the GitHub
   repo (`main` auto-deploys). Remaining: set the Supabase/Resend env vars from
   `.env.example` and `APP_URL` = the Vercel URL, apply migration 0003
   (`npm run db:migrate`), run `npm run db:cron-secrets`, then confirm rows in
   `cron.job_run_details` and 200s in `net._http_response`.
2. **Resend domain + webhook**: add `talent.ansrpo.com` in Resend, paste the
   SPF/DKIM/DMARC + MX records into DNS, create a webhook for
   `email.received`, `email.delivered`, `email.bounced`, `email.complained`
   pointing at `/api/webhooks/resend`. Start warm-up (senders at 20/day).
3. **AI layer** (week 2): `src/lib/ai/` adapter over the OpenAI Responses API
   with structured outputs; prompts loaded from `prompt_templates`; three
   calls — outreach writer (step `use_ai`), reply classifier + fact
   extractor, conversation writer; memory updater. Policy engine already has
   `validateNextContact`. Wire into `dispatcher.ts` (compose step) and
   `inbound.ts` (after opt-out check). Log tokens to `ai_usage`.
   Keep `approval_required` behaviour: drafts go to review as
   `DRAFT_APPROVAL`; only categories outside `human_review_categories` and
   confidence ≥ `auto_threshold` may auto-send when approval is off.
4. **Reply test suite** `tests/replies/` — a few hundred sample replies with
   expected intent/status/facts/suppression/next action; run on prompt changes.
5. Resume parsing (attachment → text → Luna → facts), Market Readiness Score,
   admin member management (add by email), Sentry.

## Conventions worth knowing

- Dates in the UI are rendered in UTC and labelled; candidate-facing timing
  uses the candidate's `timezone` (inferred from location at import).
- `communication_status` drives automation; `market_status` is intelligence.
  A live conversation (`CONVERSATION_ACTIVE`/`HUMAN_REVIEW`) blocks all
  sequence sends except `SEND_REPLY`.
- One pending send per candidate is enforced by a partial unique index; the
  dispatcher completes an action before inserting the next.
