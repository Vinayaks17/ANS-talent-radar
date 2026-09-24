-- Look up an auth user id by email. Service role only (used by the admin
-- "add member" action after it has checked the caller is an org admin).
create or replace function find_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function find_user_id_by_email(text) to service_role;
