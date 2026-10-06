-- Release migration: complete copies are checked hourly; incomplete pages
-- continue one page per minute. The job itself still wakes every minute.
begin;
create or replace function public.cat_history_finish_repair_owner(p_claim_id uuid,p_outcome text) returns void
language plpgsql set search_path='' as $$
begin
 if p_outcome is null or p_outcome not in ('success','retry') then raise exception 'Invalid repair outcome'; end if;
 update public.cat_history_backup_progress set repair_claim_id=null,repair_lease_until=null,
   repair_due_at=clock_timestamp()+make_interval(secs=>case when p_outcome='success' and complete then 3600 when p_outcome='success' then 60 else least(900,30*power(2,least(5,greatest(0,repair_attempts-1))))::integer end),
   repair_attempts=case when p_outcome='success' then 0 else repair_attempts end
   where repair_claim_id=p_claim_id and repair_lease_until>clock_timestamp();
 if not found then raise exception 'Stale or expired repair claim'; end if;
end $$;
commit;
