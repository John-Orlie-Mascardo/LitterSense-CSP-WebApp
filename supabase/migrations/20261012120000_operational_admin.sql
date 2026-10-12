-- Canonical USER deletion workflow and server-only audit records.
begin;
do $$ declare ownership_constraint text; begin
  select conname into ownership_constraint from pg_catalog.pg_constraint
  where conrelid='public.operational_records'::regclass and contype='c'
    and pg_catalog.pg_get_constraintdef(oid) like '%admins/%';
  if ownership_constraint is null then raise exception 'Operational ownership constraint missing'; end if;
  execute format('alter table public.operational_records drop constraint %I',ownership_constraint);
end $$;
alter table public.operational_records add constraint operational_records_owned_path check ((
  (owner_id <> '@system' and document_path ~ '^users/[^/]+(/[^/]+/[^/]+)*$' and split_part(document_path,'/',2)=owner_id)
  or (owner_id <> '@system' and document_path ~ '^(deviceConfigs|cameraDevices)/[^/]+$' and data->>'ownerId'=owner_id)
  or (owner_id <> '@system' and document_path ~ '^deleteRequests/[^/]+$' and data->>'userId'=owner_id)
  or (owner_id = '@system' and document_path ~ '^(admins|auditLogs)/[^/]+$')
) is true);

create function public.operational_write_audit(p_input jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare audit_id text := pg_catalog.gen_random_uuid()::text; stamp timestamptz := clock_timestamp(); timestamp_data jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is null
    or p_input->>'action' not in ('admin_login','admin_granted','admin_revoked','deletion_requested','deletion_approved','deletion_rejected','deletion_failed')
    or p_input->>'actorUid' is null or p_input->>'actorUid' !~ '^[^[:cntrl:]]{1,255}$'
    or octet_length(p_input::text)>65536 then raise exception 'Invalid audit record' using errcode='22023'; end if;
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null) then
    raise exception 'Primary cutover is not ready' using errcode='55000';
  end if;
  timestamp_data:=jsonb_build_object('__firestoreType','timestamp','value',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'seconds',floor(extract(epoch from stamp)),'nanoseconds',floor((extract(epoch from stamp)-floor(extract(epoch from stamp)))*1000000000));
  insert into public.operational_records(document_path,owner_id,data) values('auditLogs/'||audit_id,'@system',jsonb_build_object(
    'action',p_input->>'action','actorUid',p_input->>'actorUid','actorEmail',p_input->'actorEmail',
    'targetUid',p_input->'targetUid','targetEmail',p_input->'targetEmail','details',coalesce(p_input->'details','{}'::jsonb),'createdAt',timestamp_data));
  return audit_id;
end $$;
revoke all on function public.operational_write_audit(jsonb) from public,anon,authenticated;
grant execute on function public.operational_write_audit(jsonb) to service_role;

create function public.operational_admin_transition(p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile public.operational_records%rowtype; user_id text:=p_input->>'userId'; action text:=p_input->>'action';
  state text; next_data jsonb; audit_action text; audit_details jsonb; audit_id text; timestamp_data jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or user_id is null or user_id !~ '^[A-Za-z0-9:_-]{1,128}$'
    or action is null or action not in ('request','reject','start','fail','finish')
    or p_input->>'actorUid' is null or p_input->>'actorUid' !~ '^[A-Za-z0-9:_-]{1,128}$'
    or octet_length(p_input::text)>65536 then raise exception 'Invalid admin transition' using errcode='22023'; end if;
  if action='request' and p_input->>'actorUid'<>user_id then raise exception 'Owner request required' using errcode='42501'; end if;
  -- ponytail: share the existing global mutation lock; use per-owner locks if throughput requires it.
  perform pg_catalog.pg_advisory_xact_lock(621006,2);
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null) then
    raise exception 'Primary cutover is not ready' using errcode='55000'; end if;
  select * into profile from public.operational_records where document_path='users/'||user_id and owner_id=user_id for update;
  if not found then raise exception 'Account profile not found' using errcode='P0002'; end if;
  state:=coalesce(profile.data->>'deletionStatus','none'); next_data:=profile.data;
  if (action='request' and state<>'none') or (action='reject' and state<>'pending')
    or (action='start' and state not in ('pending','failed') and not (state='processing' and coalesce((profile.data->>'deletionStartedAt')::timestamptz,'-infinity'::timestamptz) < clock_timestamp()-interval '10 minutes')) or (action in ('fail','finish') and state<>'processing') then
    raise exception 'Deletion request is not actionable' using errcode='55000'; end if;
  if action='request' then
    audit_action:='deletion_requested'; audit_details:=jsonb_build_object('reason',coalesce(nullif(left(trim(p_input->>'reason'),250),''),'No reason provided'));
  elsif action='reject' then
    next_data:=(next_data-'deletionRequestedAt'-'deletionError')||jsonb_build_object('deletionStatus','none');
    audit_action:='deletion_rejected'; audit_details:=jsonb_build_object('result','returned_to_normal');
  elsif action='start' then
    next_data:=next_data||jsonb_build_object('deletionStatus','processing','deletionError',null,'deletionStartedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    delete from public.operational_records where owner_id=user_id and document_path<>profile.document_path;
    delete from public.sms_accounts where owner_id=user_id;
  elsif action='fail' then
    next_data:=next_data||jsonb_build_object('deletionStatus','failed','deletionError',coalesce(nullif(left(p_input->>'error',300),''),'Account deletion failed. Retry the request.'));
    audit_action:='deletion_failed'; audit_details:=jsonb_build_object('error',next_data->>'deletionError');
  else
    audit_action:='deletion_approved'; audit_details:=jsonb_build_object('result','permanently_deleted');
  end if;
  if audit_action is not null then
    audit_id:=public.operational_write_audit(jsonb_build_object('action',audit_action,'actorUid',p_input->>'actorUid',
      'actorEmail',p_input->'actorEmail','targetUid',user_id,'targetEmail',coalesce(profile.data->'email',p_input->'actorEmail'),'details',audit_details));
    if action='request' then
      select data->'createdAt' into timestamp_data from public.operational_records where document_path='auditLogs/'||audit_id;
      next_data:=next_data||jsonb_build_object('deletionStatus','pending','deletionRequestedAt',timestamp_data);
    end if;
  end if;
  if action='finish' then delete from public.operational_records where document_path=profile.document_path;
  else update public.operational_records set data=next_data,revision=revision+1,updated_at=clock_timestamp() where document_path=profile.document_path;
  end if;
  return jsonb_build_object('profile',next_data,'auditId',audit_id);
end $$;
revoke all on function public.operational_admin_transition(jsonb) from public,anon,authenticated;
grant execute on function public.operational_admin_transition(jsonb) to service_role;

create index operational_audit_latest on public.operational_records ((data->'createdAt'->>'value') desc, document_path desc) where owner_id='@system' and document_path like 'auditLogs/%';
create index operational_deleted_owner on public.operational_records ((data->>'targetUid')) where owner_id='@system' and document_path like 'auditLogs/%' and data->>'action'='deletion_approved';

-- Do not let in-flight owner writes recreate linked records or alert projections after cleanup.
create function public.operational_admin_write_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(621006,2);
  if exists(select 1 from public.operational_records where owner_id='@system' and document_path like 'auditLogs/%' and data->>'action'='deletion_approved' and data->>'targetUid'=new.owner_id) then
    raise exception 'Account deletion completed' using errcode='55000'; end if;
  if tg_table_name='operational_records' then
    if new.document_path='users/'||new.owner_id then return new; end if;
  end if;
  if exists(select 1 from public.operational_records where document_path='users/'||new.owner_id
    and data->>'deletionStatus' in ('processing','failed')) then raise exception 'Account deletion in progress' using errcode='55000'; end if;
  return new;
end $$;
revoke all on function public.operational_admin_write_guard() from public,anon,authenticated;
grant execute on function public.operational_admin_write_guard() to service_role;
create trigger operational_admin_linked_write_guard before insert or update on public.operational_records for each row execute function public.operational_admin_write_guard();
create trigger operational_admin_sms_write_guard before insert or update on public.sms_accounts for each row execute function public.operational_admin_write_guard();
create or replace function public.operational_commit(p_owner_id text, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing public.operational_records%rowtype; expected bigint; changed integer := 0;
begin
  if p_owner_id is null or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 100 or octet_length(p_changes::text) > 2097152 then
    raise exception 'Invalid commit' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(621006, 2);
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null) then
    raise exception 'Primary cutover is not ready' using errcode='55000';
  end if;
  if exists(select 1 from public.operational_records where owner_id=p_owner_id
    and document_path like 'deleteRequests/%' and data->>'status' in ('deleting','deleted')) then
    raise exception 'Account deletion in progress' using errcode='42501';
  end if;
  if exists(select 1 from public.operational_records where document_path='users/'||p_owner_id
    and data->>'deletionStatus' in ('processing','failed')) then
    raise exception 'Account deletion in progress' using errcode='55000';
  end if;
  if p_owner_id='@system' and exists(select 1 from jsonb_array_elements(p_changes) r where r->>'document_path' like 'auditLogs/%') then
    raise exception 'Audit entries are immutable' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_array_elements(p_changes) r group by r->>'document_path' having count(*) > 1) then
    raise exception 'Duplicate commit path' using errcode = '23505';
  end if;
  for item in select value from jsonb_array_elements(p_changes)
    order by case when value->>'document_path' ~ '^users/[^/]+/cats/[^/]+$' and value->>'action' is distinct from 'delete' then 0 else 1 end, value->>'document_path'
  loop
    if item->>'action' is null or item->>'action' not in ('set', 'delete') or item->>'expected_revision' is null then
      raise exception 'Invalid change' using errcode = '22023';
    end if;
    expected := (item->>'expected_revision')::bigint;
    if expected < 0 then raise exception 'Invalid revision' using errcode = '22023'; end if;
    select * into existing from public.operational_records where document_path = item->>'document_path' for update;
    if found then
      if existing.owner_id <> p_owner_id then raise exception 'Wrong owner' using errcode = '42501'; end if;
      if existing.revision <> expected then raise exception 'Revision conflict' using errcode = '40001'; end if;
      if item->>'action' = 'delete' then
        delete from public.operational_records where document_path = existing.document_path;
      else
        update public.operational_records set data = item->'data', revision = revision + 1, updated_at = clock_timestamp()
          where document_path = existing.document_path;
      end if;
    else
      if expected <> 0 then raise exception 'Missing expected record' using errcode = '40001'; end if;
      if item->>'action' = 'set' then
        insert into public.operational_records(document_path, owner_id, data) values(item->>'document_path', p_owner_id, item->'data');
      end if;
    end if;
    changed := changed + 1;
  end loop;
  return jsonb_build_object('changed', changed);
end $$;
revoke execute on function public.operational_commit(text, jsonb) from public, anon, authenticated;
grant execute on function public.operational_commit(text, jsonb) to service_role;
commit;