-- Who gets the daily "something is broken" email (sent only when health checks fail).
alter table org_settings
  add column if not exists alert_emails text[] not null default '{}';
