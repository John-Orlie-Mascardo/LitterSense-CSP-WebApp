-- Apply together with sms-profile-number.sql before deploying the new alert worker.
begin;
alter table public.sms_outbox add column if not exists context jsonb not null default '{}';
alter table public.sms_accounts add column if not exists fcm_tokens jsonb not null default '[]' check(jsonb_typeof(fcm_tokens)='array');
-- Historical alerts must never become a new push backlog.
alter table public.sms_outbox add column if not exists push_status text not null default 'cancelled' check(push_status in('pending','sending','sent','failed','unknown','cancelled'));
alter table public.sms_outbox alter column push_status set default 'pending';
alter table public.sms_outbox add column if not exists push_claimed_at timestamptz;
create index if not exists sms_push_pending on public.sms_outbox(created_at) where push_status='pending';

create or replace function public.register_push_token(p_owner_id text,p_token text,p_remove boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if length(p_token)<20 or length(p_token)>4096 then raise exception 'Invalid token'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_token,0));
 if p_remove then
  update public.sms_accounts set fcm_tokens=(select coalesce(jsonb_agg(t),'[]') from jsonb_array_elements_text(fcm_tokens) t where t<>p_token) where owner_id=p_owner_id;
 else
  insert into public.sms_accounts(owner_id) values(p_owner_id) on conflict do nothing;
  -- One browser subscription must not receive alerts for two signed-in accounts.
  update public.sms_accounts set fcm_tokens=(select coalesce(jsonb_agg(t),'[]') from jsonb_array_elements_text(fcm_tokens) t where t<>p_token) where owner_id<>p_owner_id and fcm_tokens ? p_token;
  update public.sms_accounts set fcm_tokens=(select coalesce(jsonb_agg(t),'[]') from (select value t from jsonb_array_elements_text(fcm_tokens) where value<>p_token limit 19) retained)||jsonb_build_array(p_token) where owner_id=p_owner_id;
 end if;
end; $$;
revoke all on function public.register_push_token(text,text,boolean) from public,anon,authenticated;
grant execute on function public.register_push_token(text,text,boolean) to service_role;

create or replace function public.claim_push_outbox(p_owner_id text default null,p_limit integer default 2)
returns setof public.sms_outbox language plpgsql security invoker set search_path='' as $$
begin
 update public.sms_outbox set push_status='unknown' where push_status='sending' and push_claimed_at<now()-interval '2 minutes';
 update public.sms_outbox set push_status='cancelled' where push_status='pending' and created_at<now()-interval '24 hours';
 return query update public.sms_outbox o set push_status='sending',push_claimed_at=now() where o.id in(
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
end; $$;
revoke all on function public.claim_push_outbox(text,integer) from public,anon,authenticated;
grant execute on function public.claim_push_outbox(text,integer) to service_role;
commit;
