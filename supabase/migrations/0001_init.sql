-- Talent Radar — initial schema
-- Multi-tenant from day one: every table carries org_id and is protected by RLS.
-- The AI never writes to suppressions (enforced in code; service-role paths are
-- limited to workers/webhooks — see CLAUDE.md rule 2).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role as enum ('admin', 'recruiter', 'viewer');
create type market_status as enum (
  'UNKNOWN', 'AVAILABLE_NOW', 'OPEN_TO_RIGHT_OPPORTUNITY', 'OPEN_LATER',
  'PASSIVE', 'NOT_LOOKING', 'NOT_INTERESTED'
);
create type communication_status as enum (
  'NOT_CONTACTED', 'SEQUENCE_ACTIVE', 'WAITING_FOR_REPLY', 'CONVERSATION_ACTIVE',
  'NURTURE_SCHEDULED', 'HUMAN_REVIEW', 'CLOSED', 'SUPPRESSED'
);
create type availability_precision as enum (
  'DAY', 'WEEK', 'MONTH', 'MONTH_APPROXIMATE', 'QUARTER', 'YEAR', 'UNKNOWN'
);
create type suppression_reason as enum (
  'OPT_OUT', 'COMPLAINT', 'BOUNCE', 'MANUAL', 'LEGAL'
);
create type campaign_status as enum ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
create type step_type as enum ('INITIAL', 'FOLLOW_UP', 'FINAL', 'NURTURE');
create type enrollment_status as enum ('ENROLLED', 'COMPLETED', 'STOPPED', 'SUPPRESSED');
create type message_direction as enum ('INBOUND', 'OUTBOUND');
create type message_kind as enum (
  'INITIAL', 'FOLLOW_UP', 'FINAL', 'NURTURE', 'RECONNECT', 'REPLY', 'MANUAL'
);
create type delivery_status as enum (
  'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'RECEIVED'
);
create type action_type as enum (
  'SEND_INITIAL', 'SEND_FOLLOW_UP', 'SEND_FINAL', 'SEND_NURTURE', 'SEND_REPLY',
  'RECONNECT', 'REFRESH_PROFILE', 'HUMAN_REVIEW'
);
create type action_status as enum (
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
);
create type sender_status as enum ('WARMING', 'WARMED', 'PAUSED');
create type review_status as enum (
  'OPEN', 'APPROVED', 'SKIPPED', 'TAKEN_OVER', 'SUPPRESSED'
);
create type actor_type as enum ('SYSTEM', 'AI', 'USER');
create type fact_source as enum ('EMAIL', 'CSV', 'USER', 'RESUME', 'SYSTEM');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand jsonb not null default '{}'::jsonb,           -- {"logo_text":"ANS","primary":"#0E2A5C","accent":"#F59763"}
  allowed_email_domains text[] not null default '{}',  -- users with these domains can self-join as recruiter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger orgs_updated before update on orgs for each row execute function set_updated_at();

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'recruiter',
  display_name text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members(user_id);

-- Org ids the current user belongs to. SECURITY DEFINER so RLS policies can
-- call it without recursing into org_members' own policy.
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid()
$$;

create or replace function auth_role_in(p_org uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from org_members where user_id = auth.uid() and org_id = p_org
$$;

create table org_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  max_outreach_per_day int not null default 160,
  max_new_per_sender_per_day int not null default 40,
  max_followups_per_sender_per_day int not null default 20,
  min_gap_hours int not null default 72,
  max_unanswered_per_sequence int not null default 3,
  default_nurture_days int not null default 120,
  send_days int[] not null default '{2,3,4}',          -- ISO weekday: 1=Mon … 7=Sun
  send_window_start time not null default '09:00',
  send_window_end time not null default '16:00',
  default_timezone text not null default 'America/New_York',
  auto_threshold numeric(3,2) not null default 0.90,
  review_threshold numeric(3,2) not null default 0.75,
  approval_required boolean not null default true,      -- pilot mode: humans approve every AI reply
  human_review_categories text[] not null default
    '{COMPLAINT,LEGAL_PRIVACY,ANGRY,DISCRIMINATION,COMP_NEGOTIATION,OFFER_DISCUSSION,CLIENT_CONFLICT,EXISTING_PROCESS,UNCLEAR_IDENTITY,SENSITIVE_INFO}',
  models jsonb not null default
    '{"outreach":"gpt-5.6-luna","classify":"gpt-5.6-luna","reply":"gpt-5.6-luna","memory":"gpt-5.6-luna","resume":"gpt-5.6-luna","match":"gpt-5.6-terra"}'::jsonb,
  outreach_paused boolean not null default false,
  paused_by uuid references auth.users(id),
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger org_settings_updated before update on org_settings for each row execute function set_updated_at();

create table senders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  display_name text not null,
  status sender_status not null default 'WARMING',
  daily_cap_new int not null default 20,
  daily_cap_followup int not null default 10,
  warmup_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ---------------------------------------------------------------------------
-- Candidates
-- ---------------------------------------------------------------------------
create table candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  email_normalized text not null,
  phone text,
  phone_normalized text,
  linkedin_url text,
  current_title text,
  current_company text,
  location text,
  timezone text,
  source text,
  source_reference text,
  owner_user_id uuid references auth.users(id),
  market_status market_status not null default 'UNKNOWN',
  communication_status communication_status not null default 'NOT_CONTACTED',
  availability_date date,
  availability_precision availability_precision not null default 'UNKNOWN',
  current_salary jsonb,        -- {"currency":"USD","amount":165000}
  target_salary jsonb,         -- {"currency":"USD","minimum":175000}
  preferred_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  remote_preference text,
  notice_period text,
  skills text[] not null default '{}',
  industry text,
  memory_summary text,
  notes text,
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  next_contact_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, email_normalized)
);
create index candidates_org_market_idx on candidates(org_id, market_status);
create index candidates_org_comm_idx on candidates(org_id, communication_status);
create index candidates_org_next_idx on candidates(org_id, next_contact_at);
create index candidates_org_phone_idx on candidates(org_id, phone_normalized) where phone_normalized is not null;
create index candidates_org_linkedin_idx on candidates(org_id, linkedin_url) where linkedin_url is not null;
create trigger candidates_updated before update on candidates for each row execute function set_updated_at();

create table candidate_facts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  fact_type text not null,                 -- AVAILABILITY, TARGET_COMPENSATION, PREFERRED_ROLES, ...
  value_json jsonb not null,
  source fact_source not null,
  source_message_id uuid,                  -- fk added after messages exists
  confidence numeric(3,2),
  reported_at timestamptz not null default now(),
  verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index candidate_facts_cand_idx on candidate_facts(candidate_id, fact_type, reported_at desc);

-- ---------------------------------------------------------------------------
-- Suppression — separate, never written by the AI
-- ---------------------------------------------------------------------------
create table suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  channel text not null default 'email',
  identifier text not null,                -- normalized email
  candidate_id uuid references candidates(id) on delete set null,
  reason suppression_reason not null,
  note text,
  created_by uuid references auth.users(id), -- null = system (webhook / opt-out rule)
  created_by_label text,                     -- 'webhook:bounce', 'rule:opt_out', 'user'
  created_at timestamptz not null default now(),
  unique (org_id, channel, identifier)
);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  objective text,
  target_audience text,
  sector text,
  status campaign_status not null default 'DRAFT',
  recontact_days int not null default 90,
  daily_sender_limit int not null default 40,
  send_days int[],                           -- null = inherit org_settings
  send_window_start time,
  send_window_end time,
  sender_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_org_idx on campaigns(org_id, status);
create trigger campaigns_updated before update on campaigns for each row execute function set_updated_at();

create table prompt_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,  -- null = global default
  name text not null,                                 -- outreach_writer, reply_classifier, ...
  version int not null default 1,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name, version)
);

create table campaign_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_number int not null,
  delay_days int not null default 0,
  message_type step_type not null,
  use_ai boolean not null default false,
  template_subject text,
  template_body text,
  prompt_template_id uuid references prompt_templates(id),
  unique (campaign_id, step_number)
);

create table campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  status enrollment_status not null default 'ENROLLED',
  current_step int not null default 0,
  unanswered_count int not null default 0,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (campaign_id, candidate_id)
);
create index enrollments_candidate_idx on campaign_enrollments(candidate_id);

-- ---------------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  sender_id uuid references senders(id),
  thread_token text not null unique,        -- embedded in Reply-To / Message-ID for inbound matching
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index conversations_candidate_idx on conversations(candidate_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  sender_id uuid references senders(id),
  provider text not null default 'resend',
  provider_message_id text,
  provider_thread_id text,
  internet_message_id text,                 -- RFC 5322 Message-ID
  in_reply_to text,
  direction message_direction not null,
  from_address text not null,
  to_address text not null,
  subject text,
  text_body text,
  html_body text,
  reply_text text,                          -- inbound: body with quoted history and signature stripped
  message_type message_kind not null,
  step_number int,
  sent_at timestamptz,
  received_at timestamptz,
  delivery_status delivery_status not null default 'QUEUED',
  ai_generated boolean not null default false,
  ai_model text,
  prompt_version text,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);
create index messages_candidate_idx on messages(candidate_id, created_at desc);
create unique index messages_provider_idx on messages(provider, provider_message_id) where provider_message_id is not null;

alter table candidate_facts
  add constraint candidate_facts_source_message_fk
  foreign key (source_message_id) references messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Scheduling — the heart of the autonomy
-- ---------------------------------------------------------------------------
create table scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  action_type action_type not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status action_status not null default 'PENDING',
  attempt_count int not null default 0,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  created_by_label text,                    -- 'enroll', 'policy:reconnect', 'user'
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index scheduled_actions_due_idx on scheduled_actions(status, scheduled_for) where status = 'PENDING';
create index scheduled_actions_candidate_idx on scheduled_actions(candidate_id, status);

-- One pending send per candidate at a time (policy: no double outreach)
create unique index scheduled_actions_one_pending_send_idx
  on scheduled_actions(candidate_id)
  where status in ('PENDING', 'PROCESSING')
    and action_type in ('SEND_INITIAL','SEND_FOLLOW_UP','SEND_FINAL','SEND_NURTURE','RECONNECT');

-- Claim due actions atomically. Workers call this with the service role.
create or replace function claim_scheduled_actions(p_limit int, p_worker text)
returns setof scheduled_actions
language plpgsql security definer set search_path = public as $$
begin
  return query
  update scheduled_actions sa
     set status = 'PROCESSING',
         locked_at = now(),
         locked_by = p_worker,
         attempt_count = sa.attempt_count + 1
   where sa.id in (
     select id from scheduled_actions
      where status = 'PENDING' and scheduled_for <= now()
      order by scheduled_for
      limit p_limit
      for update skip locked
   )
  returning sa.*;
end $$;

-- ---------------------------------------------------------------------------
-- Human review queue
-- ---------------------------------------------------------------------------
create table review_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  inbound_message_id uuid references messages(id) on delete cascade,
  category text not null,                   -- DRAFT_APPROVAL, COMPLAINT, COMP_NEGOTIATION, LOW_CONFIDENCE, ...
  reason text,
  ai_classification jsonb,
  draft_reply text,
  status review_status not null default 'OPEN',
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index review_items_open_idx on review_items(org_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Audit, inbound events, usage, imports
-- ---------------------------------------------------------------------------
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete set null,
  event_type text not null,
  actor actor_type not null,
  actor_user_id uuid references auth.users(id),
  model text,
  prompt_version text,
  input_ref text,
  output_ref text,
  decision text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_candidate_idx on audit_events(candidate_id, created_at desc);
create index audit_events_org_idx on audit_events(org_id, created_at desc);

create table inbound_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete set null,
  provider text not null default 'resend',
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, provider_event_id)
);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete set null,
  action text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_tokens int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_org_idx on ai_usage(org_id, created_at desc);

create table imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  filename text not null,
  row_count int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_duplicate int not null default 0,
  skipped_suppressed int not null default 0,
  skipped_invalid int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table org_settings enable row level security;
alter table senders enable row level security;
alter table candidates enable row level security;
alter table candidate_facts enable row level security;
alter table suppressions enable row level security;
alter table campaigns enable row level security;
alter table prompt_templates enable row level security;
alter table campaign_steps enable row level security;
alter table campaign_enrollments enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table scheduled_actions enable row level security;
alter table review_items enable row level security;
alter table audit_events enable row level security;
alter table inbound_events enable row level security;
alter table ai_usage enable row level security;
alter table imports enable row level security;

create policy orgs_member_read on orgs for select using (id in (select auth_org_ids()));
create policy orgs_admin_update on orgs for update using (auth_role_in(id) = 'admin');

create policy members_read on org_members for select using (org_id in (select auth_org_ids()));
create policy members_admin_write on org_members for all
  using (auth_role_in(org_id) = 'admin') with check (auth_role_in(org_id) = 'admin');

create policy settings_read on org_settings for select using (org_id in (select auth_org_ids()));
create policy settings_admin_write on org_settings for update
  using (auth_role_in(org_id) = 'admin') with check (auth_role_in(org_id) = 'admin');

create policy senders_read on senders for select using (org_id in (select auth_org_ids()));
create policy senders_admin_write on senders for all
  using (auth_role_in(org_id) = 'admin') with check (auth_role_in(org_id) = 'admin');

-- Recruiters and admins read/write candidate data; viewers read only.
create policy candidates_read on candidates for select using (org_id in (select auth_org_ids()));
create policy candidates_write on candidates for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy facts_read on candidate_facts for select using (org_id in (select auth_org_ids()));
create policy facts_write on candidate_facts for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy suppressions_read on suppressions for select using (org_id in (select auth_org_ids()));
create policy suppressions_write on suppressions for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy campaigns_read on campaigns for select using (org_id in (select auth_org_ids()));
create policy campaigns_write on campaigns for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy prompts_read on prompt_templates for select
  using (org_id is null or org_id in (select auth_org_ids()));
create policy prompts_admin_write on prompt_templates for all
  using (org_id is not null and auth_role_in(org_id) = 'admin')
  with check (org_id is not null and auth_role_in(org_id) = 'admin');

create policy steps_read on campaign_steps for select using (org_id in (select auth_org_ids()));
create policy steps_write on campaign_steps for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy enrollments_read on campaign_enrollments for select using (org_id in (select auth_org_ids()));
create policy enrollments_write on campaign_enrollments for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy conversations_read on conversations for select using (org_id in (select auth_org_ids()));
create policy messages_read on messages for select using (org_id in (select auth_org_ids()));
create policy messages_insert on messages for insert
  with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy actions_read on scheduled_actions for select using (org_id in (select auth_org_ids()));
create policy actions_write on scheduled_actions for all
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy review_read on review_items for select using (org_id in (select auth_org_ids()));
create policy review_write on review_items for update
  using (auth_role_in(org_id) in ('admin','recruiter')) with check (auth_role_in(org_id) in ('admin','recruiter'));

create policy audit_read on audit_events for select using (org_id in (select auth_org_ids()));
create policy usage_read on ai_usage for select using (org_id in (select auth_org_ids()));
create policy imports_read on imports for select using (org_id in (select auth_org_ids()));
create policy imports_write on imports for insert with check (auth_role_in(org_id) in ('admin','recruiter'));
-- inbound_events: service role only (no user policies).

-- ---------------------------------------------------------------------------
-- Self-join by email domain: first member becomes admin, later ones recruiter.
-- Called from the app after login with the user's own JWT.
-- ---------------------------------------------------------------------------
create or replace function join_org_by_email_domain()
returns table (org_id uuid, role member_role)
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_domain text;
  v_org uuid;
  v_role member_role;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return; end if;
  v_domain := lower(split_part(v_email, '@', 2));

  select o.id into v_org from orgs o where v_domain = any(o.allowed_email_domains) limit 1;
  if v_org is null then return; end if;

  if exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid()) then
    return query select m.org_id, m.role from org_members m where m.org_id = v_org and m.user_id = auth.uid();
    return;
  end if;

  if exists (select 1 from org_members m where m.org_id = v_org) then
    v_role := 'recruiter';
  else
    v_role := 'admin';
  end if;

  insert into org_members(org_id, user_id, role, display_name)
  values (v_org, auth.uid(), v_role, split_part(v_email, '@', 1));

  return query select v_org, v_role;
end $$;

-- ---------------------------------------------------------------------------
-- Seed: tenant #1
-- ---------------------------------------------------------------------------
insert into orgs (name, slug, brand, allowed_email_domains)
values (
  'ANS RPO Solutions', 'ans',
  '{"logo_text":"ANS","primary":"#0E2A5C","accent":"#F59763"}'::jsonb,
  '{ansrpo.com,hireecom.com}'
);
insert into org_settings (org_id) select id from orgs where slug = 'ans';
