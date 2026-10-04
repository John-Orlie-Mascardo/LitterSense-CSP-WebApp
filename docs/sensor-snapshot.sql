create table public.sensor_snapshots (
 token_hash text not null references public.sms_devices(token_hash) on delete cascade,
 source text not null check (source in ('rfid','gas-ultrasonic')),
 data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
 received_at timestamptz not null,
 primary key(token_hash,source)
);
alter table public.sensor_snapshots enable row level security;
revoke all on public.sensor_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.sensor_snapshots to service_role;

create function public.remember_sensor_device(p_owner_id text,p_token_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare saved_owner text;
begin
 if p_owner_id is null or length(p_owner_id) not between 1 and 128 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid sensor ownership'; end if;
 insert into public.sms_accounts(owner_id) values(p_owner_id) on conflict(owner_id) do nothing;
 perform 1 from public.sms_accounts where owner_id=p_owner_id for update;
 insert into public.sms_devices as device(token_hash,owner_id) values(p_token_hash,p_owner_id)
 on conflict(token_hash) do update set owner_id=excluded.owner_id where device.owner_id=excluded.owner_id
 returning owner_id into saved_owner;
 if saved_owner is null then raise exception 'Sensor ownership conflict'; end if;
end; $$;

create or replace function public.sync_sms_account(p_owner_id text,p_phone_number text,p_notifications jsonb,p_cats jsonb,p_token_hash text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sms_accounts(owner_id,phone_number,notifications,cats)
 values(p_owner_id,p_phone_number,p_notifications,p_cats)
 on conflict(owner_id) do update set phone_number=excluded.phone_number,notifications=excluded.notifications,cats=excluded.cats,synced_at=now();
 if p_token_hash is not null then perform public.remember_sensor_device(p_owner_id,p_token_hash); end if;
 delete from public.sms_devices where owner_id=p_owner_id and token_hash is distinct from p_token_hash;
end; $$;

create function public.save_sensor_mirror(p_token_hash text,p_source text,p_data jsonb,p_received_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare allowed text[];
begin
 if p_source not in ('rfid','gas-ultrasonic') or p_source is null or p_received_at is null or not isfinite(p_received_at) or p_received_at>clock_timestamp()+interval '5 seconds' or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid sensor snapshot'; end if;
 allowed:=case when p_source='rfid' then array['online','rfidHex','rfidCard','lastRfidMs','rfidEvent','sessionActive','activeRfidHex','activeRfidCard','activeSessionStartMs','activeSessionDurationMs','currentSessionStatus','lastSessionStatus','lastSessionDurationMs','lastSessionEndMs','completedSessionCount','falseEntryCount','noExitTimeoutCount','noExitTimeoutMs','lastRecordedEventId'] else array['gasUltrasonicOnline','mq135','mq136','mq135Raw','mq136Raw','distanceCm'] end;
 if exists(select 1 from jsonb_each(p_data) as item where not(item.key=any(allowed)) or jsonb_typeof(item.value) not in ('string','number','boolean','null')) then raise exception 'Invalid sensor fields'; end if;
 perform 1 from public.sms_devices where token_hash=p_token_hash for key share;
 if not found then return false; end if;
 insert into public.sensor_snapshots as snapshot(token_hash,source,data,received_at) values(p_token_hash,p_source,p_data,p_received_at)
 on conflict(token_hash,source) do update set data=snapshot.data||excluded.data,received_at=excluded.received_at
 where snapshot.received_at<excluded.received_at;
 return true;
end; $$;

create function public.read_sensor_mirrors(p_owner_id text)
returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('source',snapshot.source,'data',snapshot.data,'received_at',snapshot.received_at)),'[]'::jsonb)
 from public.sensor_snapshots snapshot join public.sms_devices device using(token_hash) where device.owner_id=p_owner_id;
$$;

revoke all on function public.remember_sensor_device(text,text),public.save_sensor_mirror(text,text,jsonb,timestamptz),public.read_sensor_mirrors(text),public.sync_sms_account(text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.remember_sensor_device(text,text),public.save_sensor_mirror(text,text,jsonb,timestamptz),public.read_sensor_mirrors(text),public.sync_sms_account(text,text,jsonb,jsonb,text) to service_role;
