-- A history upload and the following live heartbeat can describe one gas episode.
-- Suppress the later live copy unless history shows that the saved episode cleared.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.dedupe_live_saved_gas_alert()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 field text;
 live_received timestamptz:=coalesce(new.created_at,now());
begin
 if new.reason not in ('Ammonia detected','Hydrogen sulfide detected')
  or new.context->>'source'='gas_history'
 then return new; end if;

 field:=case when new.reason='Ammonia detected' then 'mq135Raw' else 'mq136Raw' end;
 if exists(
  select 1 from public.sms_outbox saved
  where saved.owner_id=new.owner_id
   and saved.reason=new.reason
   and saved.context->>'source'='gas_history'
   and saved.created_at between live_received-interval '2 minutes' and live_received
   and saved.context->>'occurredAt' is not null
   and not exists(
    select 1 from public.operational_records history
    where history.owner_id=new.owner_id
     and history.document_path like 'users/%/sensorHistory/%'
     and history.data->>'source'='gas-ultrasonic'
     and history.data->>'deviceId'=saved.context->>'deviceId'
     and history.data->>'timingKnown'='true'
     and history.data->>field='1'
     and (history.data->>'capturedAt')::timestamptz>(saved.context->>'occurredAt')::timestamptz
     and (history.data->>'capturedAt')::timestamptz<=live_received
   )
 ) then
  return null;
 end if;
 return new;
end $$;

revoke all on function public.dedupe_live_saved_gas_alert() from public,anon,authenticated;
drop trigger if exists dedupe_live_saved_gas_alert on public.sms_outbox;
create trigger dedupe_live_saved_gas_alert
before insert on public.sms_outbox
for each row execute function public.dedupe_live_saved_gas_alert();
commit;
