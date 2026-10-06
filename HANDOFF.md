# ANSPIRE (formerly Talent Radar) — handoff (state as of 6 Oct 2026)

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
- **AI layer** (`src/lib/ai/`, GPT-5.6 Luna): two calls per reply at most.
  `classifyReply` = intent, market status, opt-out, availability (with
  precision), reconnect date, facts with verbatim quotes, review flags,
  updated memory, confidence. `draftReply` = conversation writer.
  `writeOutreach` = AI version of an approved template (steps with "AI-written"
  ticked, and every RECONNECT). Prompts are rows in `prompt_templates`
  (active: reply_classifier v2, conversation_writer v2, outreach_writer v1);
  add a new version row to change one, then run the reply suite. Every call is
  logged to `ai_usage` with cost; `org_settings.ai_enabled` and
  `ai_monthly_budget_usd` (default $25) gate all calls. Any AI failure falls
  back to a person (replies) or the plain template (outreach).
  Measured cost: ~$0.001 per reply handled, ~$0.0003 per AI-written email.
- **Decisions** (`src/lib/policy/reply-decision.ts`, pure, unit-tested):
  opt-out → suppress (label `policy:ai_opt_out`, no threshold) → out-of-office
  → org's human-review categories → confidence < review threshold → draft
  (approval mode or < auto threshold → `DRAFT_APPROVAL`; else auto-send) or no
  reply. `validateDraft` blocks links, placeholders, emails, money figures,
  AI mentions, bad length (failure forces approval). Facts are stored only if
  their quote appears in the reply; confident ones update the candidate.
  Reconnect dates go through `validateNextContact` (`workers/reconnect.ts`).
- **Review queue** `/review`: AI summary, intent, confidence, facts with
  quotes, suggested check-in date, AI draft (edit freely). Approve queues
  `SEND_REPLY` (+ check-in after it is sent); Skip can still schedule the
  check-in; Suppress. Unedited AI drafts keep AI provenance on the message.
- **Settings** `/settings`: rate limits, send window, AI on/off + monthly
  budget + spend, thresholds, model per action (Luna default, Terra for
  match), human-review categories, **Team** (admin adds anyone by email with a
  role; new accounts get a one-time password shown once; change role, remove),
  **Your account** (change password), senders, suppression counts, PAUSE ALL.
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
- **Email footer**: every sequence/reconnect email gets an opt-out line with the
  unsubscribe link and the org's postal address (Settings → postal address;
  toggle `email_footer_enabled`). Replies in a live conversation don't.
- **Warm-up ramp**: WARMING senders are capped at 10 new/day (days 1–3), 20
  (4–7), 30 (8–14), 40 (15–21), then their configured cap; follow-ups at half.
  Day 1 = the sender's first real email (or when an admin sets it to Warming).
  The dispatcher picks the sender with the most headroom.
- **Safety nets**: sends carry a Resend idempotency key (`action-<id>`);
  actions stuck in PROCESSING > 15 min are re-claimed; the dispatcher stops at
  240 s and releases the rest; RFC 2606 test domains (example.com, *.test …)
  are never mailed.
- **Tests**: `npm test` (48 unit). Integration: `RUN_INTEGRATION=1` with
  `.env.local` exported (7 tests, uses real Luna, ~$0.002). Reply suite:
  `RUN_AI_EVAL=1 npx vitest run tests/replies` (35 cases, ~$0.03; last run
  35/35; pass bar = no missed or false opt-outs, ≥ 90%). Pause the pg_cron job
  during integration runs:
  `select cron.alter_job((select jobid from cron.job where jobname='talent-radar-dispatch'), active := false);`

## V2 preview (behind `org_settings.matching_enabled`, off for ANS, on for demo)

- **Market Readiness Score** (0–100, `src/lib/policy/readiness.ts`, pure +
  tested): market status, how close their availability date is, how recently
  they confirmed it, recent replies / live conversation. Stored in
  `candidates.readiness_score`; refreshed after every reply, manual status
  change and import, and for all orgs in the 03:00 UTC cron run
  (`npm run db:readiness` to force). Shown on profiles and as a sortable
  column when matching is on.
- **Requirement matching** (`/requirements`, `src/lib/matching/match.ts`):
  recruiter enters a role (title, client, location, work mode, pay range,
  must-haves, nice-to-haves, JD). "Find matches": Postgres full-text prefilter
  on title/skills/roles (`match_candidates_prefilter`, trigger-maintained
  `search_tsv`) blended with readiness → top 40 → AI role fit in batches of 10
  (`role_fit_scorer` prompt, model = `models.match`, Terra by default; work
  facts only, no names/contact details) → Match = Fit × (0.5 + Ready/200).
  Shortlist / reject / undo per candidate; decisions survive re-runs. Cost
  measured ≈ $0.03 per requirement run on Terra.
- Turn on per org in Settings → "Requirement matching (V2 preview)".
- **Resume parsing** (profile → Resume card): PDF (unpdf) or DOCX (mammoth),
  ≤ 4 MB, stored in the private `resumes` bucket (`{org}/{candidate}/…`),
  text → `resume_parser` prompt (`models.resume`, Luna, ≈ $0.001) → fills
  blank title/company/location/industry, merges skills, adds facts with
  source RESUME (RESUME_FILE, CURRENT_TITLE, EXPERIENCE_YEARS, SKILLS,
  WORK_HISTORY, EDUCATION, CERTIFICATIONS). Email-reported facts always win.
  pdf.js detaches the buffer it is given: pass `bytes.slice()`.
- **System health** (`src/lib/health.ts`): dashboard card + daily email in the
  03:00 UTC run (`src/lib/health-digest.ts`) to `org_settings.alert_emails`
  (Settings → "Health alerts go to"), only when a check fails. Checks:
  overdue/stuck actions, failed actions, webhook silence/errors, bounce and
  complaint rates, AI fallbacks/budget. Idempotent per org per day.
- Not built yet: client login (V2 part 2).

## Demo tenant (for client walkthroughs)

`npm run demo:seed` rebuilds "Northstar Staffing (demo)" (slug `demo`): 30
fictional candidates, a campaign, and 18 replies run through the real AI
pipeline (~$0.01), leaving 5 open review items (3 drafts, 1 legal/privacy,
1 low confidence). Outreach is paused and every address is on example.com /
.test, so nothing can ever be mailed. Login `demo@northstar-staffing.test`;
the password lives in `~/.config/talent-radar/demo_password` (or set
`DEMO_PASSWORD`). Re-run before each demo to reset it.

## Environment

- Supabase dev project `talent-radar-dev` ref `hhdtretmidmdfmkopdyj` (us-east-1).
  Migrations: `npm run db:migrate` (needs `SUPABASE_ACCESS_TOKEN`, runs over
  HTTPS via the Management API). Applied: 0001–0010. **Pending: 0011
  (`alert_emails`; the code tolerates it missing) — the old token returns 401,
  needs a new one.** 0012's bucket + prompt already exist (made via REST); the
  file is idempotent. Types: `npm run db:types`
  (Management API, no CLI needed).
- Test login: `claude-test@ansrpo.com` (password in the session that created it;
  create another admin from the sign-up tab with an @ansrpo.com address).
- ANS org sends as "Vini" <vini@talent.ansrpo.com> (domain verified 30 Sep),
  replies come back via `vini+t_<token>@talent.ansrpo.com`. Footer address:
  Suite 105, 501 Silverside, Wilmington, DE 19809, US. Warm-up 10→40/day.
- **Internal test (6–10 Oct)**: 11 colleague addresses, one reply scenario each;
  candidates tagged internal-test. Only those may be auto-approved by the
  scheduled check-ins (audited as `claude:test-approval`). Never mail
  ankitadewani@gmail.com (suppressed). Delivery status only moves forward
  (`deliveryRank` in `workers/inbound.ts`); events are claimed before processing.
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

1. ~~Deploy~~ done: `ans-talent-radar-eie4.vercel.app`, pg_cron verified
   (200s every 5 min). `OPENAI_API_KEY` must be set in Vercel for the AI.
2. ~~Resend domain + webhook~~ done (verified 30 Sep, webhook secret set). Old notes: domain `talent.ansrpo.com` created in Resend
   (id 1c21cec2…, sending + receiving) and webhook 74bc6487… pointing at
   `/api/webhooks/resend` (received, sent, delivered, delayed, bounced,
   complained). Remaining: add the 5 DNS records at GoDaddy
   (domaincontrol.com), click Verify in Resend, and set
   `RESEND_WEBHOOK_SECRET` in Vercel (value in
   `~/.config/talent-radar/.env`), then redeploy.: add `talent.ansrpo.com` in Resend, paste the
   SPF/DKIM/DMARC + MX records into DNS, create a webhook for
   `email.received`, `email.delivered`, `email.bounced`, `email.complained`
   pointing at `/api/webhooks/resend`. Start warm-up (senders at 20/day).
3. ~~AI layer~~, ~~reply suite~~ (grow it from real misreads),
   ~~member management~~ — done.
4. Resume parsing (attachment → text → Luna → facts), Market Readiness Score,
   Sentry (needs a DSN), prompt editor UI (prompts are DB rows today).
5. Before real client data: Vercel Pro (Hobby is non-commercial).

## Conventions worth knowing

- Dates in the UI are rendered in UTC and labelled; candidate-facing timing
  uses the candidate's `timezone` (inferred from location at import).
- `communication_status` drives automation; `market_status` is intelligence.
  A live conversation (`CONVERSATION_ACTIVE`/`HUMAN_REVIEW`) blocks all
  sequence sends except `SEND_REPLY`.
- One pending send per candidate is enforced by a partial unique index; the
  dispatcher completes an action before inserting the next.
