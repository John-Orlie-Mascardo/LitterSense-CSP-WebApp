-- Server-only admin record writes; table constraints restrict @system to admins paths.
begin;
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
