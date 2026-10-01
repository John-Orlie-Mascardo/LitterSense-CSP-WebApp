create table public.sms_accounts (
 owner_id text primary key,
 phone_number text not null default '' check (phone_number = '' or phone_number ~ '^\+[1-9][0-9]{6,14}$'),
 notifications jsonb not null default '{}',
 cats jsonb not null default '[]' check (jsonb_typeof(cats) = 'array'),
 synced_at timestamptz not null default now()
);
create table public.sms_devices (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 owner_id text not null references public.sms_accounts(owner_id) on delete cascade
);
alter table public.sms_accounts enable row level security;
alter table public.sms_devices enable row level security;
revoke all on public.sms_accounts, public.sms_devices from public, anon, authenticated;
grant select, insert, update, delete on public.sms_accounts, public.sms_devices to service_role;
create function public.sync_sms_account(p_owner_id text, p_phone_number text, p_notifications jsonb, p_cats jsonb, p_token_hash text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.sms_accounts(owner_id, phone_number, notifications, cats)
 values(p_owner_id, p_phone_number, p_notifications, p_cats)
 on conflict(owner_id) do update set phone_number=excluded.phone_number, notifications=excluded.notifications, cats=excluded.cats, synced_at=now();
 delete from public.sms_devices where owner_id=p_owner_id and token_hash is distinct from p_token_hash;
 if p_token_hash is not null then
   insert into public.sms_devices(token_hash,owner_id) values(p_token_hash,p_owner_id)
   on conflict(token_hash) do update set owner_id=excluded.owner_id;
 end if;
end;
$$;
revoke all on function public.sync_sms_account(text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.sync_sms_account(text,text,jsonb,jsonb,text) to service_role;
