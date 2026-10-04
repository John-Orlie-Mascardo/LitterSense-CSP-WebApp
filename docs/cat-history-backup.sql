-- Server-only cat catalogs and visit history. Existing SMS/sensor objects are unchanged.
begin;
create table public.cat_backup_catalogs (
  owner_id text primary key references public.sms_accounts(owner_id) on delete cascade,
  revision bigint not null check (revision between 1 and 9007199254740991),
  source_read_at timestamptz not null,
  complete boolean not null check (complete)
);
create table public.cat_profile_backups (
  owner_id text not null references public.cat_backup_catalogs(owner_id) on delete cascade,
  cat_id text not null check (cat_id not in ('', '.', '..') and position('/' in cat_id)=0 and octet_length(cat_id)<=1500),
  revision bigint not null,
  deleted boolean not null default false,
  cat jsonb not null,
  details jsonb not null,
  primary key (owner_id, cat_id)
);
create table public.cat_visit_backups (
  owner_id text not null references public.sms_accounts(owner_id) on delete cascade,
  session_id text not null check (session_id not in ('', '.', '..') and position('/' in session_id)=0 and octet_length(session_id)<=1500),
  cat_id text not null check (cat_id not in ('', '.', '..') and position('/' in cat_id)=0 and octet_length(cat_id)<=1500),
  data jsonb not null,
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  token_hash text check (token_hash ~ '^[a-f0-9]{64}$'), -- deliberately not a device FK
  state text not null check (state in ('primary_saved','pending','claimed','conflict','cancelled')),
  conflict_detected boolean not null default false,
  reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_id uuid,
  lease_until timestamptz,
  backed_up_at timestamptz not null default now(),
  primary key (owner_id, session_id)
);
create index cat_visit_backup_history on public.cat_visit_backups(owner_id, (data->>'date'), session_id);
create index cat_visit_backup_due on public.cat_visit_backups(next_attempt_at) where state in ('pending','claimed');
create table public.cat_history_backup_progress (
  owner_id text primary key references public.sms_accounts(owner_id) on delete cascade,
  cursor text,
  scanned bigint not null default 0 check (scanned>=0),
  complete boolean not null default false,
  checked_at timestamptz not null default now(),
  last_error text,
  repair_claim_id uuid,
  repair_lease_until timestamptz,
  repair_attempts integer not null default 0,
  repair_due_at timestamptz not null default now()
);

create function public.cat_history_validate_owner(p_owner_id text) returns void
language plpgsql set search_path='' as $$
begin
  if p_owner_id is null or length(p_owner_id) not between 1 and 128 then raise exception 'Invalid backup owner'; end if;
end $$;

create function public.cat_history_visit_json(p_row jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('sessionId',p_row->>'session_id','catId',p_row->>'cat_id','data',p_row->'data','digest',p_row->>'digest','tokenHash',p_row->'token_hash','state',p_row->>'state')
$$;

create function public.cat_history_semantic(p_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_array(p_data->>'catId',p_data->'durationSecs',coalesce(p_data->>'startedAt',''),coalesce(p_data->>'endedAt',''),coalesce(p_data->>'date',''),coalesce(p_data->>'sessionStatus',''),coalesce(p_data->'mq135Delta','0'::jsonb),coalesce(p_data->'mq136Delta','0'::jsonb))
$$;

create function public.cat_history_save_catalog(p_owner_id text,p_catalog jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare v_revision bigint; v_read timestamptz; v_profile jsonb; v_ids text[]; v_key text; v_old bigint;
begin
  perform public.cat_history_validate_owner(p_owner_id);
  if p_catalog->'complete' is distinct from 'true'::jsonb or jsonb_typeof(p_catalog->'profiles') is distinct from 'array' then raise exception 'Incomplete catalog'; end if;
  v_revision := (p_catalog->>'revision')::bigint; v_read := (p_catalog->>'sourceReadAt')::timestamptz;
  if v_revision is null or v_revision not between 1 and 9007199254740991 or v_read is null or v_read>clock_timestamp()+interval '5 seconds' then raise exception 'Invalid catalog revision or receipt'; end if;
  select array_agg(value->>'catId') into v_ids from jsonb_array_elements(p_catalog->'profiles');
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then raise exception 'Duplicate cat IDs'; end if;
  for v_profile in select value from jsonb_array_elements(p_catalog->'profiles') loop
    if v_profile->>'catId' is null or v_profile->>'catId' in ('','.','..') or position('/' in (v_profile->>'catId'))>0 or octet_length(v_profile->>'catId')>1500 or jsonb_typeof(v_profile->'cat') is distinct from 'object' or jsonb_typeof(v_profile->'details') is distinct from 'object' or octet_length(v_profile::text)>32768 then raise exception 'Invalid profile'; end if;
    for v_key in select jsonb_object_keys(v_profile->'cat') loop
      if v_key <> all(array['name','status','avatar','isOnline']) then raise exception 'Unsupported cat field'; end if;
    end loop;
    for v_key in select jsonb_object_keys(v_profile->'details') loop
      if v_key <> all(array['breed','gender','dob','rfidTag','healthInsight','weight','baseline']) then raise exception 'Unsupported details field'; end if;
    end loop;
  end loop;
  insert into public.sms_accounts(owner_id) values(p_owner_id) on conflict do nothing;
  -- Owner-row lock serializes first insert as well as replacement.
  perform 1 from public.sms_accounts where owner_id=p_owner_id for update;
  select revision into v_old from public.cat_backup_catalogs where owner_id=p_owner_id;
  if v_old>=v_revision then return jsonb_build_object('applied',false); end if;
  insert into public.cat_backup_catalogs values(p_owner_id,v_revision,v_read,true)
    on conflict(owner_id) do update set revision=excluded.revision,source_read_at=excluded.source_read_at;
  update public.cat_profile_backups set deleted=true,cat='{}',details='{}',revision=v_revision
    where owner_id=p_owner_id and not (cat_id=any(coalesce(v_ids,array[]::text[])));
  insert into public.cat_profile_backups(owner_id,cat_id,revision,cat,details)
    select p_owner_id,value->>'catId',v_revision,value->'cat',value->'details' from jsonb_array_elements(p_catalog->'profiles')
    on conflict(owner_id,cat_id) do update set revision=excluded.revision,cat=excluded.cat,details=excluded.details,deleted=false;
  insert into public.cat_history_backup_progress(owner_id) values(p_owner_id) on conflict do nothing;
  return jsonb_build_object('applied',true);
end $$;

create function public.cat_history_read_catalog(p_owner_id text) returns jsonb
language plpgsql stable set search_path='' as $$
begin
  perform public.cat_history_validate_owner(p_owner_id);
  return (select jsonb_build_object('revision',c.revision,'sourceReadAt',c.source_read_at,'complete',c.complete,
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('catId',p.cat_id,'cat',p.cat,'details',p.details) order by p.cat_id) from public.cat_profile_backups p where p.owner_id=c.owner_id and not p.deleted),'[]'::jsonb))
    from public.cat_backup_catalogs c where c.owner_id=p_owner_id);
end $$;

create function public.cat_history_resolve_device(p_token_hash text) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('ownerId',d.owner_id,'tokenHash',d.token_hash,'catalog',public.cat_history_read_catalog(d.owner_id))
 from public.sms_devices d join public.cat_backup_catalogs c on c.owner_id=d.owner_id and c.complete where d.token_hash=p_token_hash
$$;

create function public.cat_history_save_visits(p_owner_id text,p_visits jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare v jsonb; v_old public.cat_visit_backups; v_inserted integer:=0; v_duplicates integer:=0; v_conflicts integer:=0; v_key text;
begin
  perform public.cat_history_validate_owner(p_owner_id);
  if jsonb_typeof(p_visits) is distinct from 'array' or jsonb_array_length(p_visits)>100 then raise exception 'Invalid visit batch'; end if;
  perform 1 from public.sms_accounts where owner_id=p_owner_id for update;
  if not found then raise exception 'Unknown backup owner'; end if;
  for v in select value from jsonb_array_elements(p_visits) loop
    if v->>'state' not in ('primary_saved','pending') or v->>'state' is null or jsonb_typeof(v->'data') is distinct from 'object' or v->>'catId' is distinct from v->'data'->>'catId' or jsonb_typeof(v->'data'->'durationSecs') is distinct from 'number' or (v->'data'->>'durationSecs')::numeric<0 or octet_length((v->'data')::text)>32768 then raise exception 'Invalid visit'; end if;
    for v_key in select jsonb_object_keys(v->'data') loop
      if v_key <> all(array['catId','date','time','startedAt','endedAt','durationSecs','mq135Delta','mq136Delta','anomaly','anomalyType','sessionStatus','summaryVisits','syncedFromDevice']) then raise exception 'Unsupported visit field'; end if;
    end loop;
    -- Authorization is repeated even on a pending retry; revoked mappings cannot enqueue.
    if v->>'state'='pending' and not exists(select 1 from public.sms_devices d join public.cat_backup_catalogs c on c.owner_id=d.owner_id and c.complete join public.cat_profile_backups p on p.owner_id=c.owner_id and not p.deleted where d.owner_id=p_owner_id and d.token_hash=v->>'tokenHash' and p.cat_id=v->>'catId') then raise exception 'Pending visit is unauthorized'; end if;
    select * into v_old from public.cat_visit_backups where owner_id=p_owner_id and session_id=v->>'sessionId' for update;
    if found then
      if v_old.digest<>v->>'digest' or public.cat_history_semantic(v_old.data)<>public.cat_history_semantic(v->'data') then
        update public.cat_visit_backups set conflict_detected=true,reason='Conflicting session identity',state=case when state='primary_saved' then state else 'conflict' end,claim_id=null,lease_until=null where owner_id=p_owner_id and session_id=v_old.session_id;
        v_conflicts:=v_conflicts+1;
      else
        v_duplicates:=v_duplicates+1;
        if v->>'state'='primary_saved' then update public.cat_visit_backups set state='primary_saved',claim_id=null,lease_until=null where owner_id=p_owner_id and session_id=v_old.session_id; end if;
      end if;
    else
      insert into public.cat_visit_backups(owner_id,session_id,cat_id,data,digest,token_hash,state)
        values(p_owner_id,v->>'sessionId',v->>'catId',v->'data',v->>'digest',v->>'tokenHash',v->>'state');
      v_inserted:=v_inserted+1;
    end if;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'duplicates',v_duplicates,'conflicts',v_conflicts);
end $$;

create function public.cat_history_read_visits(p_owner_id text,p_query jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare v_limit integer:=(p_query->>'limit')::integer; v_sort text:=p_query->>'sort'; v_cursor jsonb; v_rows jsonb; v_next text; v_total integer;
begin
  perform public.cat_history_validate_owner(p_owner_id);
  if v_limit is null or v_limit not between 1 and 100 or v_sort is null or v_sort not in ('asc','desc') or p_query->>'startDate' is null or p_query->>'endDate' is null or (p_query->>'startDate')::date>(p_query->>'endDate')::date then raise exception 'Invalid history query'; end if;
  if p_query->>'cursor' is not null then
    v_cursor:=(p_query->>'cursor')::jsonb;
    if v_cursor->>'owner' is distinct from p_owner_id or v_cursor->'query' is distinct from (p_query-'cursor') then raise exception 'History cursor changed'; end if;
  end if;
  with candidates as (
    select * from public.cat_visit_backups v where owner_id=p_owner_id and state in ('primary_saved','pending','claimed')
      and data->>'date' between p_query->>'startDate' and p_query->>'endDate'
      and (p_query->>'catId' is null or cat_id=p_query->>'catId')
      and (v_cursor is null or (v_sort='asc' and (data->>'date',session_id)>(v_cursor->>'date',v_cursor->>'id')) or (v_sort='desc' and (data->>'date',session_id)<(v_cursor->>'date',v_cursor->>'id')))
    order by case when v_sort='asc' then data->>'date' end asc,case when v_sort='asc' then session_id end asc,case when v_sort='desc' then data->>'date' end desc,case when v_sort='desc' then session_id end desc limit v_limit+1
  ), numbered as (select c.*,row_number() over(order by case when v_sort='asc' then data->>'date' end asc,case when v_sort='asc' then session_id end asc,case when v_sort='desc' then data->>'date' end desc,case when v_sort='desc' then session_id end desc) n from candidates c)
  select coalesce(jsonb_agg(public.cat_history_visit_json(to_jsonb(n)) order by n.n) filter(where n.n<=v_limit),'[]'::jsonb),count(*)::integer,
    max(jsonb_build_object('owner',p_owner_id,'query',p_query-'cursor','date',data->>'date','id',session_id)::text) filter(where n.n=v_limit)
    into v_rows,v_total,v_next from numbered n;
  return jsonb_build_object('rows',v_rows,'nextCursor',case when v_total>v_limit then v_next else null end,'source','supabase','complete',coalesce((select complete from public.cat_history_backup_progress where owner_id=p_owner_id),false),'backedUpAt',(select max(backed_up_at) from public.cat_visit_backups where owner_id=p_owner_id),'pendingCount',(select count(*) from public.cat_visit_backups where owner_id=p_owner_id and state in ('pending','claimed')));
end $$;

create function public.cat_history_read_progress(p_owner_id text) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 perform public.cat_history_validate_owner(p_owner_id);
 return (select jsonb_build_object('cursor',cursor,'scanned',scanned,'complete',complete,'checkedAt',checked_at,'lastError',last_error) from public.cat_history_backup_progress where owner_id=p_owner_id);
end $$;
create function public.cat_history_save_progress(p_owner_id text,p_progress jsonb) returns void
language plpgsql set search_path='' as $$
declare v_old public.cat_history_backup_progress; v_scanned bigint:=(p_progress->>'scanned')::bigint; v_checked timestamptz:=(p_progress->>'checkedAt')::timestamptz; v_reset boolean;
begin
 perform public.cat_history_validate_owner(p_owner_id);
 if v_scanned is null or v_scanned<0 or v_checked is null or v_checked>clock_timestamp()+interval '5 seconds' or jsonb_typeof(p_progress->'complete') is distinct from 'boolean' or length(p_progress->>'cursor')>4096 or length(p_progress->>'lastError')>1000 then raise exception 'Invalid progress'; end if;
 insert into public.cat_history_backup_progress(owner_id) values(p_owner_id) on conflict do nothing;
 select * into v_old from public.cat_history_backup_progress where owner_id=p_owner_id for update;
 v_reset:=v_old.complete and v_scanned=0 and p_progress->>'cursor' is null and p_progress->'complete'='false'::jsonb;
 if v_checked<v_old.checked_at or (not v_reset and (v_scanned<v_old.scanned or (v_scanned=v_old.scanned and p_progress->>'cursor' is distinct from v_old.cursor))) then raise exception 'Stale progress'; end if;
 update public.cat_history_backup_progress set cursor=p_progress->>'cursor',scanned=v_scanned,complete=(p_progress->>'complete')::boolean,checked_at=v_checked,last_error=p_progress->>'lastError' where owner_id=p_owner_id;
end $$;

create function public.cat_history_claim_visits(p_limit integer) returns jsonb
language plpgsql set search_path='' as $$
declare v_result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 5 then raise exception 'Invalid claim limit'; end if;
 with picked as (select owner_id,session_id from public.cat_visit_backups where (state='pending' and next_attempt_at<=clock_timestamp()) or (state='claimed' and lease_until<=clock_timestamp()) order by next_attempt_at,owner_id,session_id for update skip locked limit p_limit), changed as (
  update public.cat_visit_backups v set state='claimed',claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1 from picked p where v.owner_id=p.owner_id and v.session_id=p.session_id returning v.*
 ) select coalesce(jsonb_agg(public.cat_history_visit_json(to_jsonb(c))||jsonb_build_object('ownerId',owner_id,'claimId',claim_id,'leaseUntil',lease_until)),'[]'::jsonb) into v_result from changed c;
 return v_result;
end $$;
create function public.cat_history_finish_claim(p_claim_id uuid,p_outcome text,p_reason text default null) returns void
language plpgsql set search_path='' as $$
begin
 if p_outcome is null or p_outcome not in ('primary_saved','conflict','cancelled','retry') or length(p_reason)>1000 then raise exception 'Invalid claim outcome'; end if;
 update public.cat_visit_backups set state=case when p_outcome='retry' then 'pending' else p_outcome end,reason=p_reason,claim_id=null,lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(900,30*power(2,least(5,greatest(0,attempts-1))))::integer)
  where claim_id=p_claim_id and state='claimed' and lease_until>clock_timestamp();
 if not found then raise exception 'Stale or expired visit claim'; end if;
end $$;
create function public.cat_history_claim_repair_owner() returns jsonb
language plpgsql set search_path='' as $$
declare v_result jsonb;
begin
 with picked as (select owner_id from public.cat_history_backup_progress where repair_due_at<=clock_timestamp() and (repair_claim_id is null or repair_lease_until<=clock_timestamp()) order by repair_due_at,owner_id for update skip locked limit 1), changed as (
  update public.cat_history_backup_progress v set repair_claim_id=gen_random_uuid(),repair_lease_until=clock_timestamp()+interval '120 seconds',repair_attempts=repair_attempts+1 from picked p where v.owner_id=p.owner_id returning v.*
 ) select jsonb_build_object('ownerId',owner_id,'claimId',repair_claim_id) into v_result from changed;
 return v_result;
end $$;
create function public.cat_history_finish_repair_owner(p_claim_id uuid,p_outcome text) returns void
language plpgsql set search_path='' as $$
begin
 if p_outcome is null or p_outcome not in ('success','retry') then raise exception 'Invalid repair outcome'; end if;
 update public.cat_history_backup_progress set repair_claim_id=null,repair_lease_until=null,repair_due_at=clock_timestamp()+make_interval(secs=>case when p_outcome='success' then 300 else least(900,30*power(2,least(5,greatest(0,repair_attempts-1))))::integer end),repair_attempts=case when p_outcome='success' then 0 else repair_attempts end where repair_claim_id=p_claim_id and repair_lease_until>clock_timestamp();
 if not found then raise exception 'Stale or expired repair claim'; end if;
end $$;

-- No policies: browser roles cannot access these tables. Invoker RPCs are service-only.
alter table public.cat_backup_catalogs enable row level security;
alter table public.cat_profile_backups enable row level security;
alter table public.cat_visit_backups enable row level security;
alter table public.cat_history_backup_progress enable row level security;
revoke all on public.cat_backup_catalogs,public.cat_profile_backups,public.cat_visit_backups,public.cat_history_backup_progress from public,anon,authenticated;
grant all on public.cat_backup_catalogs,public.cat_profile_backups,public.cat_visit_backups,public.cat_history_backup_progress to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cat_history_%' loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
