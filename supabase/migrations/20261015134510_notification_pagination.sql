-- Additive, server-only notification reads/actions; existing ingestion and push remain unchanged.
begin;

create function public.operational_notification_time(p_data jsonb)
returns numeric language plpgsql immutable security invoker set search_path = '' as $$
declare stamp jsonb := p_data->'createdAt'; value text;
begin
  if jsonb_typeof(stamp) = 'object' and stamp->>'seconds' ~ '^-?[0-9]{1,12}$'
    and coalesce(stamp->>'nanoseconds','0') ~ '^[0-9]{1,9}$' then
    return (stamp->>'seconds')::numeric * 1000000000 + coalesce((stamp->>'nanoseconds')::numeric,0);
  end if;
  value := case when jsonb_typeof(stamp) = 'string' then p_data->>'createdAt' else stamp->>'value' end;
  if value ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    return extract(epoch from value::timestamptz) * 1000000000;
  end if;
  return 0;
exception when invalid_datetime_format or datetime_field_overflow or sqlstate '22009' then return 0;
end $$;

create index operational_notifications_time on public.operational_records
  (owner_id, public.operational_notification_time(data) desc, document_path desc)
  where document_path ~ '^users/[^/]+/notifications/[^/]+$';
create index operational_notifications_unread on public.operational_records(owner_id)
  where document_path ~ '^users/[^/]+/notifications/[^/]+$' and data->'isRead' is distinct from 'true'::jsonb;

create function public.operational_notification_page(p_owner_id text, p_category text default 'all', p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result_rows jsonb; next_cursor jsonb := null; unread_count bigint; total_count bigint;
begin
  if p_owner_id is null or p_owner_id = '@system' or length(p_owner_id) not between 1 and 128 or p_owner_id ~ '[[:cntrl:]/]'
    or p_category is null or p_category not in ('all','alerts','system') or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid notification query' using errcode='22023';
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb and (
    jsonb_typeof(p_cursor) is distinct from 'object' or coalesce(p_cursor->>'time','') !~ '^-?[0-9]{1,30}(\.[0-9]{1,9})?$'
    or coalesce(p_cursor->>'path','') !~ '^users/[^/]+/notifications/[^/]+$'
    or split_part(p_cursor->>'path','/',2) <> p_owner_id or length(p_cursor->>'path') > 1024
  ) then raise exception 'Invalid notification cursor' using errcode='22023'; end if;
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null)
    or not exists(select 1 from public.operational_records where owner_id=p_owner_id and document_path='users/'||p_owner_id) then
    raise exception 'Notification storage is not ready' using errcode='55000';
  end if;
  select
    (select count(*) from public.operational_records where owner_id=p_owner_id and document_path ~ '^users/[^/]+/notifications/[^/]+$'),
    (select count(*) from public.operational_records where owner_id=p_owner_id and document_path ~ '^users/[^/]+/notifications/[^/]+$' and data->'isRead' is distinct from 'true'::jsonb)
    into total_count,unread_count;
  select coalesce(jsonb_agg(jsonb_build_object('path',document_path,'revision',revision,'data',data,'sortTime',sort_time::text)
    order by sort_time desc,document_path desc),'[]'::jsonb) into result_rows from (
    select document_path,revision,data,public.operational_notification_time(data) as sort_time
    from public.operational_records where owner_id=p_owner_id and document_path ~ '^users/[^/]+/notifications/[^/]+$'
      and (p_category='all' or (case when data->>'type'='system' or data->>'source' in ('admin','system') then 'system' else 'alerts' end)=p_category)
      and (p_cursor is null or p_cursor='null'::jsonb or
        (public.operational_notification_time(data),document_path) < ((p_cursor->>'time')::numeric,p_cursor->>'path'))
    order by public.operational_notification_time(data) desc,document_path desc limit p_limit+1
  ) page;
  if jsonb_array_length(result_rows)>p_limit then
    next_cursor := jsonb_build_object('time',result_rows->(p_limit-1)->>'sortTime','path',result_rows->(p_limit-1)->>'path');
    result_rows := result_rows-p_limit;
  end if;
  return jsonb_build_object('rows',result_rows,'nextCursor',next_cursor,'unreadCount',unread_count,'totalCount',total_count);
end $$;

create function public.operational_notification_bulk(p_owner_id text, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_owner_id is null or p_owner_id='@system' or length(p_owner_id) not between 1 and 128 or p_owner_id ~ '[[:cntrl:]/]'
    or p_action is null or p_action not in ('markRead','clear') then raise exception 'Invalid notification action' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(621006,2);
  if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null)
    or not exists(select 1 from public.operational_records where owner_id=p_owner_id and document_path='users/'||p_owner_id) then
    raise exception 'Notification storage is not ready' using errcode='55000';
  end if;
  if exists(select 1 from public.operational_records where owner_id=p_owner_id and document_path like 'deleteRequests/%' and data->>'status' in ('deleting','deleted')) then
    raise exception 'Account deletion in progress' using errcode='42501';
  end if;
  if p_action='markRead' then
    update public.operational_records set data=jsonb_set(data,'{isRead}','true'::jsonb),revision=revision+1,updated_at=clock_timestamp()
      where owner_id=p_owner_id and document_path ~ '^users/[^/]+/notifications/[^/]+$' and data->'isRead' is distinct from 'true'::jsonb;
  else
    delete from public.operational_records where owner_id=p_owner_id and document_path ~ '^users/[^/]+/notifications/[^/]+$';
  end if;
  get diagnostics changed = row_count;
  return jsonb_build_object('changed',changed);
end $$;

revoke execute on function public.operational_notification_time(jsonb),public.operational_notification_page(text,text,integer,jsonb),public.operational_notification_bulk(text,text) from public,anon,authenticated;
grant execute on function public.operational_notification_time(jsonb),public.operational_notification_page(text,text,integer,jsonb),public.operational_notification_bulk(text,text) to service_role;
commit;
