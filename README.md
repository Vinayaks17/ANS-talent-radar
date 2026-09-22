# Talent Radar

Autonomous candidate-nurturing for staffing firms. Upload a candidate pool,
enrol it in a campaign, and the system emails candidates on a schedule, reads
replies with an LLM, stores what it learns with provenance, replies when safe,
and schedules the next touch. Dashboard shows who is available when.

See `CLAUDE.md` for the engineering rules and `docs/` for the spec.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run db:migrate           # applies supabase/migrations to the project in .env.local
npm run dev
```

## Structure

```
supabase/migrations/   SQL, applied in order
src/app/               routes (App Router)
src/lib/policy/        deterministic decision functions (no AI here)
src/lib/ai/            model adapter + prompts loader
src/lib/email/         Resend send/receive
src/lib/workers/       dispatcher, reply processor
src/proxy.ts           auth/session refresh
tests/                 vitest; tests/replies is the classifier suite
```
