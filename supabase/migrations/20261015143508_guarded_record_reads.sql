-- Keep readiness checks and the requested records in one fresh database snapshot.
create function public.operational_read_records(p_owner_id text, p_path text, p_list boolean default false, p_offset integer default 0, p_require_profile boolean default true)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare parts text[]; result_rows jsonb; pattern text;
begin
  if p_owner_id is null or p_owner_id = '@system' or length(p_owner_id) not between 1 and 128 or p_owner_id ~ '[[:cntrl:]/]'
    or p_path is null or length(p_path) > 1024 or p_path ~ '[[:cntrl:]]' or p_list is null or p_require_profile is null
    or p_offset is null or p_offset not between 0 and 5000 or (not p_list and p_offset <> 0) then
    raise exception 'Invalid record query' using errcode='22023';
  end if;
  parts := string_to_array(p_path,'/');
  if parts[1] <> 'users' or parts[2] is distinct from p_owner_id or cardinality(parts) < 2
    or parts && array['','.','..'] or cardinality(parts) % 2 <> (case when p_list then 1 else 0 end)
    or (cardinality(parts)>2 and parts[3] not in ('cats','catDetails','sessions','healthLogs','notifications','reports','settings','deviceConfig','deviceState','catStats','dailyCatStats','catSessionLog'))
    or (not p_require_profile and p_path <> 'users/'||p_owner_id) then
    raise exception 'Invalid record path' using errcode='22023';
  end if;
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null)
    or (p_require_profile and not exists(select 1 from public.operational_records where owner_id=p_owner_id and document_path='users/'||p_owner_id)) then
    raise exception 'Migration data is not ready. Keep the current database mode until import and cutover are verified.' using errcode='55000';
  end if;
  if p_list then
    pattern := replace(replace(replace(p_path,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'/%';
    select coalesce(jsonb_agg(to_jsonb(page) order by document_path),'[]'::jsonb) into result_rows from (
      select document_path,owner_id,data,revision from public.operational_records
      where owner_id=p_owner_id and document_path like pattern escape E'\\'
      order by document_path limit 500 offset p_offset
    ) page;
  else
    select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) into result_rows from (
      select document_path,owner_id,data,revision from public.operational_records
      where owner_id=p_owner_id and document_path=p_path limit 1
    ) page;
  end if;
  return result_rows;
end $$;
revoke execute on function public.operational_read_records(text,text,boolean,integer,boolean) from public,anon,authenticated;
grant execute on function public.operational_read_records(text,text,boolean,integer,boolean) to service_role;
