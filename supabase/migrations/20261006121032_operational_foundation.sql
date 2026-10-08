-- Additive foundation only. No existing table, RPC, schedule or runtime mode is changed.
-- Firebase ID tokens are checked by server routes; browsers cannot access these tables/RPCs.
begin;

create table public.operational_records (
  document_path text primary key check (length(document_path) between 3 and 1024),
  owner_id text not null check (length(owner_id) between 1 and 128),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1048576),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  source_update_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check ((
    (owner_id <> '@system' and document_path ~ '^users/[^/]+(/[^/]+/[^/]+)*$' and split_part(document_path, '/', 2) = owner_id)
    or (owner_id <> '@system' and document_path ~ '^(deviceConfigs|cameraDevices)/[^/]+$' and data->>'ownerId' = owner_id)
    or (owner_id <> '@system' and document_path ~ '^deleteRequests/[^/]+$' and data->>'userId' = owner_id)
    or (owner_id = '@system' and document_path ~ '^admins/[^/]+$')
  ) is true),
  check (owner_id !~ '[[:cntrl:]/]' and document_path !~ '[[:cntrl:]]')
);
create index operational_records_owner_path on public.operational_records(owner_id, document_path text_pattern_ops);

create table public.operational_migration_state (
  singleton boolean primary key default true check (singleton),
  runtime_primary boolean not null default false,
  imported_at timestamptz,
  cutover_at timestamptz,
  check (not runtime_primary or (imported_at is not null and cutover_at is not null))
);
insert into public.operational_migration_state(singleton) values(true);

create table public.operational_tag_claims (
  owner_id text not null,
  tag text not null check (tag ~ '^[A-F0-9]{4,124}$'),
  cat_path text not null references public.operational_records(document_path) on delete cascade,
  details_path text not null unique references public.operational_records(document_path) on delete cascade,
  primary key (owner_id, tag)
);
alter table public.operational_records enable row level security;
alter table public.operational_tag_claims enable row level security;
alter table public.operational_migration_state enable row level security;
revoke all on public.operational_records, public.operational_tag_claims, public.operational_migration_state from public, anon, authenticated;
grant select, insert, update, delete on public.operational_records, public.operational_tag_claims, public.operational_migration_state to service_role;

create function public.operational_record_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare tag_value text; cat_path_value text;
begin
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.document_path <> old.document_path) then
    raise exception 'Record identity cannot be reassigned' using errcode = '23514';
  end if;
  if new.document_path ~ '^users/[^/]+/catDetails/[^/]+$' then
    if new.data ? 'rfidTag' and jsonb_typeof(new.data->'rfidTag') not in ('string', 'null') then
      raise exception 'Invalid tag value' using errcode = '23514';
    end if;
    tag_value := upper(regexp_replace(coalesce(new.data->>'rfidTag', ''), '[^a-fA-F0-9]', '', 'g'));
    cat_path_value := replace(new.document_path, '/catDetails/', '/cats/');
    if not exists(select 1 from public.operational_records where document_path = cat_path_value and owner_id = new.owner_id) then
      raise exception 'Cat details require an owned profile' using errcode = '23503';
    end if;
    delete from public.operational_tag_claims where details_path = new.document_path;
    if tag_value <> '' then
      insert into public.operational_tag_claims(owner_id, tag, cat_path, details_path)
        values(new.owner_id, tag_value, cat_path_value, new.document_path);
    end if;
  end if;
  return new;
end $$;
create trigger operational_record_guard after insert or update on public.operational_records
  for each row execute function public.operational_record_guard();
revoke execute on function public.operational_record_guard() from public, anon, authenticated;
grant execute on function public.operational_record_guard() to service_role;

-- One request is one atomic transaction. Exact repeats are no-ops; changed source data
-- is a conflict, never a silent replacement of canonical data. Dry-run exercises the
-- same constraints and rolls back every temporary write inside a subtransaction.
create function public.operational_import(p_records jsonb, p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing public.operational_records%rowtype;
  inserted_count integer := 0; duplicate_count integer := 0;
begin
  if p_apply is null or jsonb_typeof(p_records) is distinct from 'array'
    or jsonb_array_length(p_records) > 5000 or octet_length(p_records::text) > 20971520 then
    raise exception 'Invalid import batch' using errcode = '22023';
  end if;
  -- Import and future commits share a lock: no overlapping migration/runtime writes.
  perform pg_catalog.pg_advisory_xact_lock(621006, 2);
  if not exists(select 1 from public.operational_migration_state where singleton and not runtime_primary) then
    raise exception 'Import is locked after primary cutover' using errcode = '55000';
  end if;
  begin
    if exists(select 1 from jsonb_array_elements(p_records) r group by r->>'document_path' having count(*) > 1) then
      raise exception 'Duplicate source path' using errcode = '23505';
    end if;
    for item in select value from jsonb_array_elements(p_records)
      order by case when value->>'document_path' ~ '^users/[^/]+/cats/[^/]+$' then 0 else 1 end, value->>'document_path'
    loop
      if jsonb_typeof(item) is distinct from 'object' or item->>'source_update_at' is null then
        raise exception 'Invalid source record' using errcode = '22023';
      end if;
      select * into existing from public.operational_records where document_path = item->>'document_path';
      if found then
        if existing.owner_id is distinct from item->>'owner_id' or existing.data is distinct from item->'data' then
          raise exception 'Import conflicts with canonical record' using errcode = '23505';
        end if;
        duplicate_count := duplicate_count + 1;
      else
        insert into public.operational_records(document_path, owner_id, data, source_update_at)
          values(item->>'document_path', item->>'owner_id', item->'data', (item->>'source_update_at')::timestamptz);
        inserted_count := inserted_count + 1;
      end if;
    end loop;
    if not p_apply then raise sqlstate 'Z0001'; end if;
  exception when sqlstate 'Z0001' then null;
  end;
  if p_apply then update public.operational_migration_state set imported_at = clock_timestamp() where singleton; end if;
  return jsonb_build_object('applied', p_apply, 'inserted', inserted_count, 'duplicates', duplicate_count, 'conflicts', 0);
end $$;
revoke execute on function public.operational_import(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.operational_import(jsonb, boolean) to service_role;

-- Compare-and-swap writes are the foundation for atomic cat/tag and camera pairing.
-- expected_revision=0 means create; a mismatch aborts the complete batch. Routes
-- must supply a verified owner and validated fields, never arbitrary browser paths.
create function public.operational_commit(p_owner_id text, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing public.operational_records%rowtype; expected bigint; changed integer := 0;
begin
  if p_owner_id is null or p_owner_id = '@system' or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 100 or octet_length(p_changes::text) > 2097152 then
    raise exception 'Invalid commit' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(621006, 2);
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
