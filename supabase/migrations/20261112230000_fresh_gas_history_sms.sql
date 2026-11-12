-- Gas SMS fix: when the board's saved history reaches the DB before the live upload,
-- the history alert was SMS-cancelled and dedupe_live_saved_gas_alert then dropped the
-- live alert, so no SMS went out. A history alert for a detection under 2 minutes old
-- is a live event: queue its SMS with the same 1-hour per-gas cooldown as
-- ingest_sensor_sms. Offline replays (older, or is_offline_catchup) stay SMS-cancelled.
-- Undo: .docs/UNDO-20261112230000_fresh_gas_history_sms.sql
begin;
do $migration$
declare
 definition text;
 old_status constant text := $$alert_reason,'','cancelled',$$;
begin
 definition := pg_catalog.pg_get_functiondef('public.queue_missed_gas_event(public.operational_records)'::regprocedure);
 if position(old_status in definition) = 0 then
  raise exception 'Expected saved gas SMS status not found; migration was not applied';
 end if;
 definition := replace(definition, old_status, $$alert_reason,'',
   case when captured>=now()-interval '2 minutes'
     and not public.is_offline_catchup(history.owner_id,'gas-ultrasonic',captured)
     and not exists(select 1 from public.sms_outbox c where c.owner_id=history.owner_id and c.cat_id is null
      and c.reason=alert_reason and c.created_at>now()-interval '1 hour' and c.status<>'cancelled')
    then 'pending' else 'cancelled' end,$$);
 execute definition;
end $migration$;
commit;
