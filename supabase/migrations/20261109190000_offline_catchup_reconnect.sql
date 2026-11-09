-- QA #15 follow-up (2026-11-09):
-- 1. "Saved offline" now means the BOARD WAS SILENT when the event happened, instead of
--    "event older than 2 minutes". A visit that ended 30 s before reconnecting is now grouped,
--    and a live event uploaded late (board still sending heartbeats) still pushes on its own.
--    Heartbeats: RFID every 5 s idle / 15 s active -> silent after 45 s.
--                Gas every 60 s idle / 15 s active -> silent after 150 s.
-- 2. Faster summary: released after 10 s of quiet (was 60 s), checked every 5 s (was 1 min),
--    and delivered right away by calling the existing push/SMS worker (was up to 1 more minute).
-- Live alerts are untouched: only rows classified as saved-offline are grouped.
--
-- Undo: select cron.schedule('littersense-offline-summary','* * * * *','select public.release_offline_summaries()');
--       drop trigger track_rfid_heartbeat_gap on public.operational_records;
--       drop trigger track_gas_heartbeat_gap on public.sensor_snapshots;
--       drop function public.track_rfid_heartbeat_gap(), public.track_gas_heartbeat_gap(),
--         public.is_offline_catchup(text,text,timestamptz);
--       drop table public.device_heartbeat_gaps;
--       then re-run 20261109150000_offline_catchup_summary.sql's two functions.
begin;

-- Last outage per board, written when a heartbeat arrives after a long silence.
create table public.device_heartbeat_gaps (
  owner_id text not null,
  board text not null check (board in ('rfid','gas-ultrasonic')),
  offline_since timestamptz not null,
  back_at timestamptz not null,
  primary key (owner_id, board)
);
alter table public.device_heartbeat_gaps enable row level security;
revoke all on table public.device_heartbeat_gaps from public, anon, authenticated;
grant select, insert, update on table public.device_heartbeat_gaps to service_role;

create function public.track_rfid_heartbeat_gap() returns trigger
language plpgsql security invoker set search_path='' as $$
declare old_at timestamptz := public.try_timestamptz(old.data->>'updatedAt');
        new_at timestamptz := public.try_timestamptz(new.data->>'updatedAt');
begin
  if old_at is not null and new_at is not null and new_at - old_at > interval '45 seconds' then
    insert into public.device_heartbeat_gaps(owner_id,board,offline_since,back_at)
    values(new.owner_id,'rfid',old_at,new_at)
    on conflict (owner_id,board) do update set offline_since=excluded.offline_since, back_at=excluded.back_at;
  end if;
  return null;
end $$;
revoke all on function public.track_rfid_heartbeat_gap() from public,anon,authenticated;
create trigger track_rfid_heartbeat_gap after update on public.operational_records
  for each row when (new.document_path ~ '^users/[^/]+/deviceState/current$')
  execute function public.track_rfid_heartbeat_gap();

create function public.track_gas_heartbeat_gap() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.received_at is not null and new.received_at - old.received_at > interval '150 seconds' then
    insert into public.device_heartbeat_gaps(owner_id,board,offline_since,back_at)
    select d.owner_id,'gas-ultrasonic',old.received_at,new.received_at
    from public.sms_devices d where d.token_hash=new.token_hash
    on conflict (owner_id,board) do update set offline_since=excluded.offline_since, back_at=excluded.back_at;
  end if;
  return null;
end $$;
revoke all on function public.track_gas_heartbeat_gap() from public,anon,authenticated;
create trigger track_gas_heartbeat_gap after update on public.sensor_snapshots
  for each row when (new.source='gas-ultrasonic')
  execute function public.track_gas_heartbeat_gap();

-- True when the event happened while its board was silent.
create function public.is_offline_catchup(p_owner text, p_board text, p_occurred timestamptz) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare heartbeat timestamptz;
        silent_after interval := case when p_board='rfid' then interval '45 seconds' else interval '150 seconds' end;
begin
  -- The board already reconnected: the event falls inside the outage it just came back from.
  if exists(select 1 from public.device_heartbeat_gaps g
            where g.owner_id=p_owner and g.board=p_board
              and g.back_at > now() - interval '10 minutes'
              and p_occurred >= g.offline_since - interval '5 seconds'
              and p_occurred <= g.back_at + interval '5 seconds') then
    return true;
  end if;
  -- The saved events arrived before the reconnect heartbeat: the board is still silent.
  if p_board='rfid' then
    select public.try_timestamptz(r.data->>'updatedAt') into heartbeat
    from public.operational_records r where r.document_path='users/'||p_owner||'/deviceState/current';
  else
    select max(s.received_at) into heartbeat
    from public.sensor_snapshots s join public.sms_devices d on d.token_hash=s.token_hash
    where d.owner_id=p_owner and s.source='gas-ultrasonic';
  end if;
  return heartbeat is not null and now() - heartbeat > silent_after
    and p_occurred >= heartbeat - interval '5 seconds';
end $$;
revoke all on function public.is_offline_catchup(text,text,timestamptz) from public,anon,authenticated;

create or replace function public.group_offline_catchup_push() returns trigger
language plpgsql security invoker set search_path='' as $$
declare occurred timestamptz; kind text; board text; prefs jsonb; summary_id uuid;
begin
  if new.push_status is distinct from 'pending' then return new; end if;
  if new.reason='Saved notification' and new.context->>'source'='rfid_visit' then kind:='visits'; board:='rfid';
  elsif new.context->>'source'='gas_history' and new.reason='Ammonia detected' then kind:='urine'; board:='gas-ultrasonic';
  elsif new.context->>'source'='gas_history' and new.reason='Hydrogen sulfide detected' then kind:='stool'; board:='gas-ultrasonic';
  else return new; end if;
  occurred:=public.try_timestamptz(new.context->>'occurredAt');
  if occurred is null or not public.is_offline_catchup(new.owner_id, board, occurred) then return new; end if;

  -- Same defaults as claim_push_outbox: visits opt-in, gas opt-out.
  select notifications into prefs from public.sms_accounts where owner_id=new.owner_id;
  if (kind='visits' and coalesce((prefs->>'rfidVisitAlerts')::boolean,false) is not true)
    or (kind='urine' and coalesce((prefs->>'ammoniaAlerts')::boolean,true) is not true)
    or (kind='stool' and coalesce((prefs->>'h2sAlerts')::boolean,true) is not true) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('offline-summary:'||new.owner_id));
  update public.sms_outbox
    set context=context||jsonb_build_object(kind, coalesce((context->>kind)::int,0)+1, 'lastEventAt', now()::text)
    where owner_id=new.owner_id and context->>'kind'='offline_summary' and context->>'held'='true'
    returning id into summary_id;
  if summary_id is null then
    insert into public.sms_outbox(event_key,owner_id,reason,message,status,push_status,context)
    values('push:'||new.owner_id||':offline-summary:'||pg_catalog.gen_random_uuid()::text, new.owner_id,
      'Saved notification','','cancelled','cancelled',
      jsonb_build_object('kind','offline_summary','held','true','source','system',
        'visits',0,'urine',0,'stool',0,'lastEventAt',now()::text) || jsonb_build_object(kind,1));
  end if;

  new.push_status:='cancelled';
  return new;
end $$;

create or replace function public.release_offline_summaries() returns integer
language plpgsql security invoker set search_path='' as $$
declare released integer;
begin
  update public.sms_outbox
    set push_status='pending',
      context=context||jsonb_build_object(
        'held','false',
        'title','While LitterSense was offline',
        'url','/dashboard/notifications',
        'body', concat_ws(', ',
          case when (context->>'visits')::int=1 then '1 visit'
               when (context->>'visits')::int>1 then (context->>'visits')||' visits' end,
          case when (context->>'urine')::int=1 then '1 urine detection'
               when (context->>'urine')::int>1 then (context->>'urine')||' urine detections' end,
          case when (context->>'stool')::int=1 then '1 stool detection'
               when (context->>'stool')::int>1 then (context->>'stool')||' stool detections' end))
    where context->>'kind'='offline_summary' and context->>'held'='true'
      and (context->>'lastEventAt')::timestamptz < now() - interval '10 seconds';
  get diagnostics released = row_count;
  -- Deliver now through the existing push/SMS worker instead of waiting for its 1-minute run.
  if released > 0 and exists(select 1 from pg_catalog.pg_extension where extname='pg_net') then
    perform net.http_post(
      url:='https://litter-sense-csp-web-app.vercel.app/api/sms/process',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
        (select decrypted_secret from vault.decrypted_secrets where name='littersense_sms_worker')),
      body:='{}'::jsonb, timeout_milliseconds:=60000);
  end if;
  return released;
end $$;

-- Check for quiet summaries every 5 seconds (pg_cron 1.5+; skipped in local test databases).
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('littersense-offline-summary','5 seconds','select public.release_offline_summaries()');
  end if;
end $$;

commit;
