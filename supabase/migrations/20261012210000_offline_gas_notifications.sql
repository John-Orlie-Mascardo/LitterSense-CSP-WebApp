-- Historical gas alerts share existing preferences, realtime bell and push delivery.
-- The history row and alert intent commit together before the board is acknowledged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_catalog.pg_advisory_xact_lock(621006,2);
lock table public.operational_records in access exclusive mode;
create index if not exists gas_history_capture on public.operational_records
 (owner_id,(data->>'deviceId'),(data->>'capturedAt'))
 where data->>'source'='gas-ultrasonic' and document_path like 'users/%/sensorHistory/%';

create or replace function public.save_gas_notification_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.reason not in ('Ammonia detected','Hydrogen sulfide detected')
  or not exists(select 1 from public.operational_migration_state where singleton=true and runtime_primary=true)
 then return new; end if;
 insert into public.operational_records(document_path,owner_id,data)
 values('users/'||new.owner_id||'/notifications/gas_'||new.id::text,new.owner_id,
  jsonb_build_object('type','health','source',case when new.reason='Ammonia detected' then 'ammonia_alert' else 'h2s_alert' end,
   'title',case when new.context->>'source'='gas_history' then new.context->>'title'
    when new.reason='Ammonia detected' then 'Urine detected' else 'Stool detected' end,
   'message',case when new.context->>'source'='gas_history' then new.context->>'body'
    else 'Odor detected near the litter box. Check the litter box and ventilation.' end,
   'route',case when new.context->>'source'='gas_history' then '/dashboard/history' else '/dashboard' end,
   'createdAt',case when new.context->>'source'='gas_history' then to_jsonb(new.context->>'occurredAt') else to_jsonb(new.created_at) end,
   'isRead',false))
 on conflict(document_path) do nothing;
 return new;
end $$;
revoke all on function public.save_gas_notification_history() from public,anon,authenticated;

create or replace function public.queue_missed_gas_event(history public.operational_records)
returns void language plpgsql security invoker set search_path='' as $$
declare prior jsonb; live jsonb; prefs jsonb; captured timestamptz;
 field text; kind text; alert_reason text; title text; body text;
 onset public.operational_records%rowtype; last_clear text; next_clear text; episode_end timestamptz;
begin
 if history.document_path not like 'users/%/sensorHistory/%' or history.data->>'source' is distinct from 'gas-ultrasonic'
  or history.data->>'timingKnown' is distinct from 'true' or history.data->>'capturedAt' is null
 then return; end if;
 captured:=(history.data->>'capturedAt')::timestamptz;
 select s.data into live from public.sensor_snapshots s join public.sms_devices d on d.token_hash=s.token_hash
 where d.owner_id=history.owner_id and s.source='gas-ultrasonic' and s.received_at>=history.updated_at-interval '120 seconds'
  and s.received_at>=captured order by s.received_at desc limit 1;
 select data into prior from public.operational_records
 where owner_id=history.owner_id and document_path like 'users/%/sensorHistory/%'
  and data->>'source'='gas-ultrasonic' and data->>'deviceId'=history.data->>'deviceId'
  and data->>'capturedAt'<history.data->>'capturedAt'
 order by data->>'capturedAt' desc limit 1;
 select data into prefs from public.operational_records
 where owner_id=history.owner_id and document_path='users/'||history.owner_id||'/settings/notifications';
 for field,kind,alert_reason,title in select * from (values
  ('mq135Raw','ammoniaAlerts','Ammonia detected','Urine detected'),
  ('mq136Raw','h2sAlerts','Hydrogen sulfide detected','Stool detected')) kinds loop
  captured:=(history.data->>'capturedAt')::timestamptz;
  if coalesce((prefs->>kind)::boolean,true)=false then continue; end if;
  if history.data->>field='0' then
   if prior->>field='0' or live->>field='0' then continue; end if;
   onset:=history;
   episode_end:=captured+interval '15 seconds';
  elsif history.data->>field='1' and prior->>field='0' then
   -- A later live detection cannot hide an earlier episode that already cleared.
   select max(data->>'capturedAt') into last_clear from public.operational_records
    where owner_id=history.owner_id and document_path like 'users/%/sensorHistory/%'
     and data->>'source'='gas-ultrasonic' and data->>'deviceId'=history.data->>'deviceId'
     and data->>field='1' and data->>'capturedAt'<history.data->>'capturedAt';
   select * into onset from public.operational_records
    where owner_id=history.owner_id and document_path like 'users/%/sensorHistory/%'
     and data->>'source'='gas-ultrasonic' and data->>'deviceId'=history.data->>'deviceId'
     and data->>field='0' and data->>'capturedAt'<history.data->>'capturedAt'
     and (last_clear is null or data->>'capturedAt'>last_clear)
    order by data->>'capturedAt' asc limit 1;
   if onset.document_path is null then continue; end if;
   episode_end:=captured+interval '5 seconds';
  else continue;
  end if;
  captured:=(onset.data->>'capturedAt')::timestamptz;
  select max(data->>'capturedAt') into last_clear from public.operational_records
   where owner_id=history.owner_id and document_path like 'users/%/sensorHistory/%'
    and data->>'source'='gas-ultrasonic' and data->>'deviceId'=history.data->>'deviceId'
    and data->>field='1' and data->>'capturedAt'<onset.data->>'capturedAt';
  select min(data->>'capturedAt') into next_clear from public.operational_records
   where owner_id=history.owner_id and document_path like 'users/%/sensorHistory/%'
    and data->>'source'='gas-ultrasonic' and data->>'deviceId'=history.data->>'deviceId'
    and data->>field='1' and data->>'capturedAt'>onset.data->>'capturedAt';
  -- A delayed earlier sample belongs to the same episode, even when its ID differs.
  if exists(select 1 from public.sms_outbox q where q.owner_id=history.owner_id and q.reason=alert_reason
   and q.context->>'source'='gas_history' and q.context->>'deviceId'=history.data->>'deviceId'
   and (last_clear is null or (q.context->>'occurredAt')::timestamptz>last_clear::timestamptz)
   and (q.context->>'occurredAt')::timestamptz<coalesce(next_clear::timestamptz,history.updated_at)) then continue; end if;
  -- Avoid announcing a detection already handled by the live queue during this interval.
  if exists(select 1 from public.sms_outbox q where q.owner_id=history.owner_id and q.reason=alert_reason
   and q.context->>'source' is distinct from 'gas_history'
   and q.created_at between captured-interval '5 seconds' and episode_end) then continue; end if;
  body:='Saved gas detection at '||to_char(captured at time zone 'Asia/Manila','Mon DD, YYYY HH24:MI:SS')||
   ' (UTC+08:00). Uploaded after the event; check gas history for the recorded readings.';
  insert into public.sms_outbox(event_key,owner_id,reason,message,status,push_status,context)
  values('gas-history:'||onset.document_path||':'||field,history.owner_id,alert_reason,'','cancelled',
   case when captured<now()-interval '24 hours' then 'cancelled' else 'pending' end,
   jsonb_build_object('source','gas_history','deviceId',history.data->>'deviceId','occurredAt',onset.data->>'capturedAt','title',title||' (saved detection)',
    'body',body,'url','/dashboard/history')) on conflict(event_key) do nothing;
 end loop;
 return;
end $$;
revoke all on function public.queue_missed_gas_event(public.operational_records) from public,anon,authenticated;
grant execute on function public.queue_missed_gas_event(public.operational_records) to service_role;

create or replace function public.queue_missed_gas_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.queue_missed_gas_event(new);
 return new;
end $$;
revoke all on function public.queue_missed_gas_history() from public,anon,authenticated;

-- Explicit server-only recovery for already acknowledged rows. Migration alone does not send old pushes.
create or replace function public.reconcile_gas_history(p_owner_id text,p_since timestamptz)
returns integer language plpgsql security invoker set search_path='' as $$
declare history public.operational_records%rowtype; processed integer:=0; total integer;
begin
 if p_owner_id is null or p_owner_id='@system' or p_since is null or p_since<now()-interval '7 days' or p_since>now() then
  raise exception 'Invalid reconciliation scope' using errcode='22023'; end if;
 if not exists(select 1 from public.operational_migration_state where singleton and runtime_primary and cutover_at is not null) then
  raise exception 'Primary cutover is not ready' using errcode='55000'; end if;
 -- Use the same serialization as device commits to avoid racing episode deduplication.
 perform pg_catalog.pg_advisory_xact_lock(621006,2);
 select count(*) into total from public.operational_records where owner_id=p_owner_id
  and document_path like 'users/%/sensorHistory/%' and data->>'source'='gas-ultrasonic' and updated_at>=p_since;
 if total>1000 then raise exception 'Narrow reconciliation time range' using errcode='22023'; end if;
 for history in select * from public.operational_records where owner_id=p_owner_id
  and document_path like 'users/%/sensorHistory/%' and data->>'source'='gas-ultrasonic' and updated_at>=p_since
  order by data->>'capturedAt',document_path loop
  perform public.queue_missed_gas_event(history); processed:=processed+1;
 end loop;
 return processed;
end $$;
revoke all on function public.reconcile_gas_history(text,timestamptz) from public,anon,authenticated;
grant execute on function public.reconcile_gas_history(text,timestamptz) to service_role;
drop trigger if exists queue_missed_gas_history on public.operational_records;
create trigger queue_missed_gas_history after insert on public.operational_records
 for each row execute function public.queue_missed_gas_history();
commit;

