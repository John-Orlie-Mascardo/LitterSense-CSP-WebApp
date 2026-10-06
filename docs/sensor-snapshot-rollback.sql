-- Task 1 rollback. Review before execution; this drops live mirror readings.
-- It preserves existing SMS accounts, devices, visits, and messages.
drop function if exists public.save_sensor_mirror(text,text,jsonb,timestamptz);
drop function if exists public.read_sensor_mirrors(text);
drop table if exists public.sensor_snapshots;
create or replace function public.sync_sms_account(p_owner_id text,p_phone_number text,p_notifications jsonb,p_cats jsonb,p_token_hash text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sms_accounts(owner_id,phone_number,notifications,cats)
 values(p_owner_id,p_phone_number,p_notifications,p_cats)
 on conflict(owner_id) do update set phone_number=excluded.phone_number,notifications=excluded.notifications,cats=excluded.cats,synced_at=now();
 delete from public.sms_devices where owner_id=p_owner_id and token_hash is distinct from p_token_hash;
 if p_token_hash is not null then
  insert into public.sms_devices(token_hash,owner_id) values(p_token_hash,p_owner_id)
  on conflict(token_hash) do update set owner_id=excluded.owner_id;
 end if;
end; $$;
drop function if exists public.remember_sensor_device(text,text);
