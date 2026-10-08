begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.claim_push_outbox(text,integer)'::regprocedure) into definition;
 if strpos(definition, 'dashboard_abnormal')=0 then
  if strpos(definition, 'or q.context->>''source'' in(''admin'',''system'',''test'')')=0 then
   raise exception 'Unexpected claim function; review before changing';
  end if;
  definition:=replace(definition,
   'or q.context->>''source'' in(''admin'',''system'',''test'')',
   'or (q.context->>''source''=''dashboard_abnormal'' and q.cat_id is not null
    and coalesce((a.notifications->>''healthAlerts'')::boolean,true)
    and exists(select 1 from jsonb_array_elements(a.cats)c where c->>''id''=q.cat_id)
    and not exists(select 1 from jsonb_array_elements(coalesce(a.notifications->''perCat'',''[]''))p where p->>''catId''=q.cat_id and p->>''healthAlerts''=''false''))
   or q.context->>''source'' in(''admin'',''system'',''test'')');
  execute definition;
 end if;
end $migration$;
commit;
