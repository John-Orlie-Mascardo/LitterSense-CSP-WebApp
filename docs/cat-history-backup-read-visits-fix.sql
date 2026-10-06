-- Release fix: a numbered CTE column named n shadowed the row alias n.
-- to_jsonb(n) serialized the row number, yielding null visit fields.
begin;
create or replace function public.cat_history_read_visits(p_owner_id text,p_query jsonb) returns jsonb
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
  select coalesce(jsonb_agg(public.cat_history_visit_json(to_jsonb(entry)) order by entry.n) filter(where entry.n<=v_limit),'[]'::jsonb),count(*)::integer,
    max(jsonb_build_object('owner',p_owner_id,'query',p_query-'cursor','date',data->>'date','id',session_id)::text) filter(where entry.n=v_limit)
    into v_rows,v_total,v_next from numbered entry;
  return jsonb_build_object('rows',v_rows,'nextCursor',case when v_total>v_limit then v_next else null end,'source','supabase','complete',coalesce((select complete from public.cat_history_backup_progress where owner_id=p_owner_id),false),'backedUpAt',(select max(backed_up_at) from public.cat_visit_backups where owner_id=p_owner_id),'pendingCount',(select count(*) from public.cat_visit_backups where owner_id=p_owner_id and state in ('pending','claimed')));
end $$;
commit;
