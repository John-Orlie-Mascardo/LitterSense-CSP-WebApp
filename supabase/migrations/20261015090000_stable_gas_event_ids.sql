-- Give each Clear -> Detected gas episode one durable ID.
-- Push and bell alerts deduplicate by that ID. SMS keeps its hourly credit limit.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table public.sms_gas_state add column if not exists event_id text;

create or replace function public.ingest_sensor_sms(p_token_hash text,p_visits jsonb,p_gas jsonb,p_visit_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
<<sms_ingest>>
declare a public.sms_accounts; v jsonb; c jsonb; reason text; event_key text;
 day_key text; visit_count integer; inserted integer; queued integer:=0;
 kind text; active boolean; was_active boolean; prefs_enabled boolean; sms_allowed boolean; gas_event_id text;
begin
 select account.* into a from public.sms_accounts account join public.sms_devices device on device.owner_id=account.owner_id
 where device.token_hash=p_token_hash for update of account;
 if not found then return jsonb_build_object('recognized',false,'queued',0); end if;
 if jsonb_typeof(p_visits)<>'array' or jsonb_array_length(p_visits)>100 then raise exception 'Invalid visit batch'; end if;
 for v in select value from jsonb_array_elements(p_visits) loop
  select value into c from jsonb_array_elements(a.cats) where value->>'id'=v->>'catId';
  if c is null then continue; end if;
  if (v->>'occurredAt')::timestamptz < now()-interval '24 hours' or (v->>'occurredAt')::timestamptz > now()+interval '5 minutes' then continue; end if;
  day_key:=to_char((v->>'occurredAt')::timestamptz at time zone 'Asia/Manila','YYYY-MM-DD');
  event_key:=p_token_hash||':'||(v->>'eventId');
  insert into public.sms_visits(event_key,owner_id,cat_id,day_key,occurred_at)
  values(event_key,a.owner_id,v->>'catId',day_key,(v->>'occurredAt')::timestamptz) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then continue; end if;
  prefs_enabled:=coalesce((a.notifications->>'healthAlerts')::boolean,true);
  if exists(select 1 from jsonb_array_elements(coalesce(a.notifications->'perCat','[]')) pref where pref->>'catId'=v->>'catId' and pref->>'healthAlerts'='false') then prefs_enabled:=false; end if;
  if not prefs_enabled then continue; end if;
  reason:=nullif(v->>'reason','');
  select count(*) into visit_count from public.sms_visits where owner_id=a.owner_id and cat_id=v->>'catId' and sms_visits.day_key=sms_ingest.day_key;
  if reason is null and visit_count>p_visit_limit then reason:='Frequent visits'; end if;
  if reason is null then continue; end if;
  if exists(select 1 from public.sms_outbox where owner_id=a.owner_id and cat_id=v->>'catId' and sms_outbox.reason=sms_ingest.reason and created_at>now()-interval '1 hour' and (status<>'cancelled' or push_status<>'cancelled')) then continue; end if;
  insert into public.sms_outbox(event_key,owner_id,cat_id,reason,message,token_hash,context)
  values(event_key||':'||reason,a.owner_id,v->>'catId',reason,
   'LitterSense: '||left(c->>'name',60)||' - '||reason||' at '||to_char((v->>'occurredAt')::timestamptz at time zone 'Asia/Manila','Mon DD HH24:MI')||'. Please check your cat. This is an activity alert, not a diagnosis.',p_token_hash,jsonb_build_object('catName',c->>'name','occurredAt',v->>'occurredAt','durationSecs',v->'durationSecs','visitCount',visit_count))
  on conflict do nothing;
  get diagnostics inserted=row_count; queued:=queued+inserted;
 end loop;
 if p_gas is not null then
  for kind in select unnest(array['ammonia','h2s']) loop
   active:=(p_gas->>kind)::boolean;
   select state.active,state.event_id into was_active,gas_event_id from public.sms_gas_state state
    where state.token_hash=p_token_hash and state.kind=sms_ingest.kind for update;
   if active and coalesce(was_active,false) then continue; end if;
   gas_event_id:=case when active then gen_random_uuid()::text else null end;
   insert into public.sms_gas_state(token_hash,kind,active,event_id) values(p_token_hash,kind,active,gas_event_id)
   on conflict(token_hash,kind) do update set active=excluded.active,event_id=excluded.event_id;
   if not active then continue; end if;
   if coalesce((a.notifications->>case when kind='ammonia' then 'ammoniaAlerts' else 'h2sAlerts' end)::boolean,true)=false then continue; end if;
   reason:=case when kind='ammonia' then 'Ammonia detected' else 'Hydrogen sulfide detected' end;
   sms_allowed:=not exists(select 1 from public.sms_outbox where owner_id=a.owner_id and cat_id is null and sms_outbox.reason=sms_ingest.reason and created_at>now()-interval '1 hour' and status<>'cancelled');
   event_key:='gas:'||kind||':'||gas_event_id;
   insert into public.sms_outbox(event_key,owner_id,reason,message,token_hash,context,status,push_status)
   values(event_key,a.owner_id,reason,'LitterSense: '||reason||' near the litter box. Check the box and ventilation. This reading is not assigned to a specific cat.',p_token_hash,
    jsonb_build_object('eventId',gas_event_id,'occurredAt',now(),'source',case when kind='ammonia' then 'ammonia_alert' else 'h2s_alert' end,'title',case when kind='ammonia' then 'LitterSense: Ammonia (NH3) detected' else 'LitterSense: Hydrogen sulfide (H2S) detected' end,'url','/dashboard'),
    case when sms_allowed then 'pending' else 'cancelled' end,'pending')
   on conflict(event_key) do nothing;
   get diagnostics inserted=row_count; queued:=queued+inserted;
  end loop;
 end if;
 return jsonb_build_object('recognized',true,'queued',queued);
end;
$$;

create or replace function public.save_gas_notification_history()
returns trigger language plpgsql security invoker set search_path='' as $$
declare stable_event_id text;
begin
 if new.reason not in ('Ammonia detected','Hydrogen sulfide detected')
  or not exists(select 1 from public.operational_migration_state where singleton=true and runtime_primary=true)
 then return new; end if;
 stable_event_id:=coalesce(nullif(new.context->>'eventId',''),new.event_key);
 insert into public.operational_records(document_path,owner_id,data)
 values('users/'||new.owner_id||'/notifications/gas_'||md5(new.event_key),new.owner_id,
  jsonb_build_object('type','health','source',case when new.reason='Ammonia detected' then 'ammonia_alert' else 'h2s_alert' end,
   'eventId',stable_event_id,
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

revoke all on function public.ingest_sensor_sms(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.ingest_sensor_sms(text,jsonb,jsonb,integer) to service_role;
revoke all on function public.save_gas_notification_history() from public,anon,authenticated;
commit;
