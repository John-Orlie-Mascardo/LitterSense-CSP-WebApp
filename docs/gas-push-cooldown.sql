-- Follow-up to sms-profile-number.sql and push-alerts.sql. No historical alerts are requeued.
-- Device ingestion remains the trigger; no browser session or profile phone is required for push.
begin;
create or replace function public.ingest_sensor_sms(p_token_hash text,p_visits jsonb,p_gas jsonb,p_visit_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
<<sms_ingest>>
declare a public.sms_accounts; v jsonb; c jsonb; reason text; event_key text;
 day_key text; visit_count integer; inserted integer; queued integer:=0;
 kind text; active boolean; was_active boolean; prefs_enabled boolean; sms_allowed boolean; push_allowed boolean;
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
   select state.active into was_active from public.sms_gas_state state where state.token_hash=p_token_hash and state.kind=sms_ingest.kind;
   insert into public.sms_gas_state(token_hash,kind,active) values(p_token_hash,kind,active)
   on conflict(token_hash,kind) do update set active=excluded.active;
   if not active or coalesce(was_active,false) then continue; end if;
   if coalesce((a.notifications->>case when kind='ammonia' then 'ammoniaAlerts' else 'h2sAlerts' end)::boolean,true)=false then continue; end if;
   reason:=case when kind='ammonia' then 'Ammonia detected' else 'Hydrogen sulfide detected' end;
   -- A new Clear -> Detected edge can push again after one minute.
   -- SMS credit protection remains one message per gas per hour.
   sms_allowed:=not exists(select 1 from public.sms_outbox where owner_id=a.owner_id and cat_id is null and sms_outbox.reason=sms_ingest.reason and created_at>now()-interval '1 hour' and status<>'cancelled');
   push_allowed:=not exists(select 1 from public.sms_outbox where owner_id=a.owner_id and cat_id is null and sms_outbox.reason=sms_ingest.reason and created_at>now()-interval '1 minute' and push_status<>'cancelled');
   if not sms_allowed and not push_allowed then continue; end if;
   insert into public.sms_outbox(event_key,owner_id,reason,message,token_hash,context,status,push_status)
   values(gen_random_uuid()::text,a.owner_id,reason,'LitterSense: '||reason||' near the litter box. Check the box and ventilation. This reading is not assigned to a specific cat.',p_token_hash,
    jsonb_build_object('occurredAt',now(),'source',case when kind='ammonia' then 'ammonia_alert' else 'h2s_alert' end,'title',case when kind='ammonia' then 'LitterSense: Ammonia (NH3) detected' else 'LitterSense: Hydrogen sulfide (H2S) detected' end,'url','/dashboard'),
    case when sms_allowed then 'pending' else 'cancelled' end,case when push_allowed then 'pending' else 'cancelled' end);
   queued:=queued+1;
  end loop;
 end if;
 return jsonb_build_object('recognized',true,'queued',queued);
end;
$$;
commit;
