-- Visible opt-out footer on outreach (CAN-SPAM / Gmail & Yahoo bulk-sender
-- rules): each org sets the postal address shown under its emails.
alter table org_settings
  add column if not exists mailing_address text,
  add column if not exists email_footer_enabled boolean not null default true;
