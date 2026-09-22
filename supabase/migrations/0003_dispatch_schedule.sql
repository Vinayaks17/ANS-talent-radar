-- 5-minute dispatch schedule, driven from Postgres.
-- Vercel Hobby only allows daily crons, so vercel.json keeps a daily 03:00 UTC
-- safety run and pg_cron calls the dispatch route every 5 minutes via pg_net.
--
-- The URL and bearer secret live in Supabase Vault, never in this file:
--   cron_dispatch_url  e.g. https://<app>.vercel.app/api/cron/dispatch
--   cron_secret        same value as CRON_SECRET in Vercel
-- Set them with `npm run db:cron-secrets` (reads APP_URL + CRON_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_cron_dispatch()
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cron_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'invoke_cron_dispatch: vault secrets cron_dispatch_url / cron_secret not set; skipping';
    return null;
  end if;
  -- The route may run up to maxDuration (300 s); keep the request open that long.
  return net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 300000
  );
end;
$$;

-- Reads secrets: only the cron runner (postgres) may call it.
revoke all on function public.invoke_cron_dispatch() from public, anon, authenticated;

-- Named job, so re-running this upserts instead of duplicating.
select cron.schedule('talent-radar-dispatch', '*/5 * * * *', 'select public.invoke_cron_dispatch()');
