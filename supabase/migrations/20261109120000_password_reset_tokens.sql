-- Single-use, 30-minute password-reset tokens (QA #11).
-- Firebase's reset-link lifetime can't be configured, so the app issues its own links.
-- Only SHA-256 hashes are stored. Server (service role) access only.
begin;

create table public.password_reset_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  uid text not null check (length(uid) between 1 and 128),
  email text not null check (length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index password_reset_tokens_uid_created on public.password_reset_tokens (uid, created_at desc);

alter table public.password_reset_tokens enable row level security;
revoke all on table public.password_reset_tokens from public, anon, authenticated;
grant select, insert, update on table public.password_reset_tokens to service_role;

-- Old tokens are useless after 30 minutes; keep a week for troubleshooting, then remove.
select cron.schedule(
  'littersense-reset-token-cleanup',
  '17 3 * * *',
  $$delete from public.password_reset_tokens where created_at < now() - interval '7 days'$$
);

commit;
