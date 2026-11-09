-- QA #15: after a board reconnects, events it saved while offline get ONE summary push
-- ("While LitterSense was offline: 2 visits, 1 urine detection") instead of one push each.
--
-- Only catch-up rows are touched: an RFID visit push or a saved gas detection whose event
-- time is more than 2 minutes old when queued. Live alerts are never that old, so they are
-- unchanged. Each event keeps its own SMS status, bell entry and history row; only its
-- separate phone push is folded into the summary. Owner alert preferences are respected.
--
-- A held summary is stored as push_status='cancelled' with context.held='true' (the
-- existing claim_push_outbox never sends cancelled rows). release_offline_summaries() turns
-- it into a normal 'pending' system push once catch-up has been quiet for 60 seconds.
--
-- Undo: drop trigger group_offline_catchup_push on public.sms_outbox;
--       drop function public.group_offline_catchup_push(), public.release_offline_summaries();
--       select cron.unschedule('littersense-offline-summary');
begin;

create function public.group_offline_catchup_push() returns trigger
language plpgsql security invoker set search_path='' as $$
declare occurred timestamptz; kind text; prefs jsonb; summary_id uuid;
begin
  if new.push_status is distinct from 'pending' then return new; end if;
  if new.reason='Saved notification' and new.context->>'source'='rfid_visit' then kind:='visits';
  elsif new.context->>'source'='gas_history' and new.reason='Ammonia detected' then kind:='urine';
  elsif new.context->>'source'='gas_history' and new.reason='Hydrogen sulfide detected' then kind:='stool';
  else return new; end if;
  begin occurred:=(new.context->>'occurredAt')::timestamptz;
  exception when others then return new; end;
  if occurred is null or occurred > coalesce(new.created_at, now()) - interval '2 minutes' then return new; end if;

  -- Same defaults as claim_push_outbox: visits opt-in, gas opt-out.
  select notifications into prefs from public.sms_accounts where owner_id=new.owner_id;
  if (kind='visits' and coalesce((prefs->>'rfidVisitAlerts')::boolean,false) is not true)
    or (kind='urine' and coalesce((prefs->>'ammoniaAlerts')::boolean,true) is not true)
    or (kind='stool' and coalesce((prefs->>'h2sAlerts')::boolean,true) is not true) then
    return new;
  end if;

  -- One open summary per owner, even when catch-up rows arrive in parallel.
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
revoke all on function public.group_offline_catchup_push() from public,anon,authenticated;
create trigger group_offline_catchup_push before insert on public.sms_outbox
  for each row execute function public.group_offline_catchup_push();

create function public.release_offline_summaries() returns integer
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
      and (context->>'lastEventAt')::timestamptz < now() - interval '60 seconds';
  get diagnostics released = row_count;
  return released;
end $$;
revoke all on function public.release_offline_summaries() from public,anon,authenticated;
grant execute on function public.release_offline_summaries() to service_role;

-- Release quiet summaries every minute (pg_cron exists on Supabase; skipped in local test databases).
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('littersense-offline-summary','* * * * *','select public.release_offline_summaries()');
  end if;
end $$;

commit;
