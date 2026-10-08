-- Primary workers repair recipients individually. Cleanup must use the same owner scope.
begin;
create or replace function public.claim_sms_outbox(p_owner_id text default null,p_limit integer default 2)
returns setof public.sms_outbox language plpgsql security invoker set search_path='' as $$
begin
 update public.sms_outbox set status='unknown',error_code='worker_interrupted' where status='sending' and claimed_at<now()-interval '2 minutes' and (p_owner_id is null or owner_id=p_owner_id);
 update public.sms_outbox set status='cancelled',error_code='alert_expired' where status='pending' and created_at<now()-interval '24 hours' and (p_owner_id is null or owner_id=p_owner_id);
 update public.sms_outbox o set status='cancelled',error_code='profile_phone_invalid' from public.sms_accounts a where o.owner_id=a.owner_id and o.status='pending' and a.phone_number !~ '^\+639[0-9]{9}$' and (p_owner_id is null or o.owner_id=p_owner_id);
 return query update public.sms_outbox o set status='sending',claimed_at=now() where o.id in (
  select queued.id from public.sms_outbox queued join public.sms_accounts a on a.owner_id=queued.owner_id
  where queued.status='pending' and (p_owner_id is null or queued.owner_id=p_owner_id)
   and a.phone_number ~ '^\+639[0-9]{9}$' and not public.sms_in_quiet_hours(a.notifications)
   and (
    queued.reason='Test SMS'
    or (queued.cat_id is not null and coalesce((a.notifications->>'healthAlerts')::boolean,true)
     and exists(select 1 from jsonb_array_elements(a.cats) c where c->>'id'=queued.cat_id)
     and not exists(select 1 from jsonb_array_elements(coalesce(a.notifications->'perCat','[]')) pref where pref->>'catId'=queued.cat_id and pref->>'healthAlerts'='false'))
    or (queued.cat_id is null and queued.reason='Ammonia detected' and coalesce((a.notifications->>'ammoniaAlerts')::boolean,true))
    or (queued.cat_id is null and queued.reason='Hydrogen sulfide detected' and coalesce((a.notifications->>'h2sAlerts')::boolean,true))
   ) order by queued.created_at limit greatest(1,least(p_limit,2)) for update of queued skip locked
 ) returning o.*;
end $$;
create or replace function public.claim_push_outbox(p_owner_id text default null,p_limit integer default 2)
returns setof public.sms_outbox language plpgsql security invoker set search_path='' as $$
begin
 update public.sms_outbox set push_status='unknown' where push_status='sending' and push_claimed_at<now()-interval '2 minutes' and (p_owner_id is null or owner_id=p_owner_id);
 update public.sms_outbox set push_status='cancelled' where push_status='pending' and created_at<now()-interval '24 hours' and (p_owner_id is null or owner_id=p_owner_id);
 return query update public.sms_outbox o set push_status='sending',push_claimed_at=now() where o.id in (
  select q.id from public.sms_outbox q join public.sms_accounts a on a.owner_id=q.owner_id
  where q.push_status='pending' and (p_owner_id is null or q.owner_id=p_owner_id)
   and jsonb_array_length(a.fcm_tokens)>0 and not public.sms_in_quiet_hours(a.notifications)
   and (
    (q.reason='Ammonia detected' and coalesce((a.notifications->>'ammoniaAlerts')::boolean,true))
    or (q.reason='Hydrogen sulfide detected' and coalesce((a.notifications->>'h2sAlerts')::boolean,true))
    or (q.reason not in('Ammonia detected','Hydrogen sulfide detected','Saved notification','Test SMS') and q.cat_id is not null
     and coalesce((a.notifications->>'healthAlerts')::boolean,true)
     and exists(select 1 from jsonb_array_elements(a.cats)c where c->>'id'=q.cat_id)
     and not exists(select 1 from jsonb_array_elements(coalesce(a.notifications->'perCat','[]'))p where p->>'catId'=q.cat_id and p->>'healthAlerts'='false'))
    or (q.reason='Saved notification' and (
     (q.context->>'source'='rfid_visit' and coalesce((a.notifications->>'rfidVisitAlerts')::boolean,false)
      and not exists(select 1 from jsonb_array_elements(coalesce(a.notifications->'perCat','[]'))p where p->>'catId'=q.cat_id and p->>'visitAlerts'='false'))
     or (q.context->>'source'='litter_level' and coalesce((a.notifications->>'litterLevelWarnings')::boolean,true))
     or q.context->>'source' in('admin','system','test')))
   ) order by q.created_at limit greatest(1,least(p_limit,2)) for update of q skip locked
 ) returning o.*;
end $$;
revoke all on function public.claim_sms_outbox(text,integer),public.claim_push_outbox(text,integer) from public,anon,authenticated;
grant execute on function public.claim_sms_outbox(text,integer),public.claim_push_outbox(text,integer) to service_role;
commit;
