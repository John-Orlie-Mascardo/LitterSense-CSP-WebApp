-- QA #14: push the owner once when a board has been silent for more than 5 minutes.
-- Heartbeats (all in Supabase since the Oct 7 primary cutover):
--   RFID reader            operational_records users/<uid>/deviceState/current  data.updatedAt
--   Gas and doorway sensor sensor_snapshots (source 'gas-ultrasonic')           received_at
--   Camera                 operational_records cameraDevices/*                  data.lastSeenAt (newest per owner)
-- One push per outage: the event key includes the board's last-signal time, so re-running
-- the check never repeats it, and a later outage (new last signal) is announced again.
-- Boards silent for more than 24 hours are ignored (unused or retired devices).
-- Insert-only: no existing alert, SMS or data is changed. Delivered by the existing push
-- sender as a 'system' notification (quiet hours still apply).
--
-- Undo: select cron.unschedule('littersense-device-offline');
--       drop function public.queue_device_offline_pushes(), public.try_timestamptz(text);
begin;

create function public.try_timestamptz(value text) returns timestamptz
language plpgsql stable set search_path='' as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end $$;
revoke all on function public.try_timestamptz(text) from public,anon,authenticated;

create function public.queue_device_offline_pushes() returns integer
language plpgsql security invoker set search_path='' as $$
declare queued integer;
begin
  with boards as (
    select r.owner_id, 'rfid' as board, 'RFID reader' as label,
      max(public.try_timestamptz(r.data->>'updatedAt')) as last_seen
    from public.operational_records r
    where r.document_path ~ '^users/[^/]+/deviceState/current$'
    group by r.owner_id
    union all
    select d.owner_id, 'gas-ultrasonic', 'Gas and doorway sensor', max(s.received_at)
    from public.sensor_snapshots s join public.sms_devices d on d.token_hash=s.token_hash
    where s.source='gas-ultrasonic'
    group by d.owner_id
    union all
    select r.owner_id, 'camera', 'Camera', max(public.try_timestamptz(r.data->>'lastSeenAt'))
    from public.operational_records r
    where r.document_path like 'cameraDevices/%'
    group by r.owner_id
  )
  insert into public.sms_outbox(event_key,owner_id,reason,message,status,push_status,context)
  select 'push:'||b.owner_id||':device-offline:'||b.board||':'||to_char(b.last_seen at time zone 'UTC','YYYYMMDD"T"HH24MISS.MS'),
    b.owner_id, 'Saved notification', '', 'cancelled', 'pending',
    jsonb_build_object(
      'source','system', 'kind','device_offline', 'board',b.board,
      'title', b.label||' is offline',
      'body', 'Last signal at '||to_char(b.last_seen at time zone 'Asia/Manila','FMHH12:MI AM')||'. Check its power and Wi-Fi.',
      'url','/dashboard',
      'lastSeenAt', b.last_seen::text)
  from boards b
  where b.last_seen is not null
    and b.last_seen < now() - interval '5 minutes'
    and b.last_seen > now() - interval '24 hours'
    and exists(select 1 from public.sms_accounts a where a.owner_id=b.owner_id)
  on conflict (event_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end $$;
revoke all on function public.queue_device_offline_pushes() from public,anon,authenticated;
grant execute on function public.queue_device_offline_pushes() to service_role;

-- Check every minute (pg_cron exists on Supabase; skipped in local test databases).
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('littersense-device-offline','* * * * *','select public.queue_device_offline_pushes()');
  end if;
end $$;

commit;
