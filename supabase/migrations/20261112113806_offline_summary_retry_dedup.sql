-- Count a saved notification once even when its insert is retried.
-- BEFORE INSERT runs before ON CONFLICT DO NOTHING, so counting before checking
-- event_key inflated summaries and restarted the quiet timer for discarded rows.
-- Keep the existing per-owner lock around both the lookup and counter update.
-- Existing notifications/summaries are not rewritten or resent.
-- Rollback: restore group_offline_catchup_push() from
-- 20261109190000_offline_catchup_reconnect.sql (only that function).
begin;

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

  select notifications into prefs from public.sms_accounts where owner_id=new.owner_id;
  if (kind='visits' and coalesce((prefs->>'rfidVisitAlerts')::boolean,false) is not true)
    or (kind='urine' and coalesce((prefs->>'ammoniaAlerts')::boolean,true) is not true)
    or (kind='stool' and coalesce((prefs->>'h2sAlerts')::boolean,true) is not true) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('offline-summary:'||new.owner_id));
  -- A retry can arrive while a summary is held, after it was sent, or during
  -- the next batch. In every case the existing unique event must add nothing.
  if exists(select 1 from public.sms_outbox where event_key=new.event_key) then
    return new;
  end if;

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

commit;
