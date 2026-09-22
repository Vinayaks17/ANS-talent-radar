-- Helpers used by the CSV importer.

-- Resolve owner emails (from a CSV "owner" column) to member user ids within one org.
create or replace function resolve_member_emails(p_org uuid, p_emails text[])
returns table (email text, user_id uuid)
language sql stable security definer set search_path = public as $$
  select lower(u.email), m.user_id
    from org_members m
    join auth.users u on u.id = m.user_id
   where m.org_id = p_org
     and lower(u.email) = any(p_emails)
     and m.org_id in (select auth_org_ids())
$$;

-- Fill only NULL / empty columns on an existing candidate from a JSON patch.
-- Import must never overwrite what a recruiter or a reply already recorded.
create or replace function fill_candidate_blanks(p_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c candidates%rowtype;
begin
  select * into c from candidates where id = p_id and org_id in (select auth_org_ids());
  if not found then raise exception 'candidate not found or not permitted'; end if;

  update candidates set
    first_name       = coalesce(nullif(first_name, ''), p_patch->>'first_name'),
    last_name        = coalesce(nullif(last_name, ''), p_patch->>'last_name'),
    phone            = coalesce(phone, p_patch->>'phone'),
    phone_normalized = coalesce(phone_normalized, p_patch->>'phone_normalized'),
    linkedin_url     = coalesce(linkedin_url, p_patch->>'linkedin_url'),
    current_title    = coalesce(current_title, p_patch->>'current_title'),
    current_company  = coalesce(current_company, p_patch->>'current_company'),
    location         = coalesce(location, p_patch->>'location'),
    timezone         = coalesce(timezone, p_patch->>'timezone'),
    industry         = coalesce(industry, p_patch->>'industry'),
    source           = coalesce(source, p_patch->>'source'),
    notes            = coalesce(notes, p_patch->>'notes'),
    owner_user_id    = coalesce(owner_user_id, (p_patch->>'owner_user_id')::uuid),
    last_contacted_at = coalesce(last_contacted_at, (p_patch->>'last_contacted_at')::timestamptz),
    skills           = case when coalesce(array_length(skills, 1), 0) = 0 and p_patch ? 'skills'
                            then array(select jsonb_array_elements_text(p_patch->'skills')) else skills end
  where id = p_id;
end $$;

-- Private bucket for uploaded CSVs (server-side access only).
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;
