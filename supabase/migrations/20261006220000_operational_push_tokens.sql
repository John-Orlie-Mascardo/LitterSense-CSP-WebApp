-- Canonical profile and existing delivery mirror change in the same transaction.
begin;
create function public.operational_register_push_token(p_owner_id text,p_token text,p_remove boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare profile public.operational_records; tokens jsonb;
begin
 if p_remove is null or p_token is null or length(p_token)<20 or length(p_token)>4096 or p_token !~ '^[A-Za-z0-9_:\-]+$' then raise exception 'Invalid token' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(621006,2);
 if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null) then raise exception 'Primary cutover is not ready' using errcode='55000'; end if;
 select * into profile from public.operational_records where document_path='users/'||p_owner_id and owner_id=p_owner_id for update;
 if not found then raise exception 'Owner unavailable' using errcode='42501'; end if;
 if not p_remove then
  update public.operational_records r set data=jsonb_set(r.data,'{fcmTokens}',(select coalesce(jsonb_agg(t),'[]') from jsonb_array_elements_text(r.data->'fcmTokens') t where t<>p_token)),revision=revision+1,updated_at=clock_timestamp()
  where r.document_path='users/'||r.owner_id and r.owner_id<>p_owner_id and jsonb_typeof(r.data->'fcmTokens')='array' and r.data->'fcmTokens' ? p_token;
 end if;
 select coalesce(jsonb_agg(t),'[]') into tokens from (select value t from jsonb_array_elements_text(case when jsonb_typeof(profile.data->'fcmTokens')='array' then profile.data->'fcmTokens' else '[]' end) where value<>p_token limit case when p_remove then 20 else 19 end) retained;
 if not p_remove then tokens:=tokens||jsonb_build_array(p_token); end if;
 update public.operational_records set data=jsonb_set(data,'{fcmTokens}',tokens),revision=revision+1,updated_at=clock_timestamp() where document_path=profile.document_path;
 perform public.register_push_token(p_owner_id,p_token,p_remove);
end $$;
create function public.operational_project_push_tokens(p_owner_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare profile public.operational_records; tokens jsonb; token text;
begin
 perform pg_catalog.pg_advisory_xact_lock(621006,2);
 if not exists(select 1 from public.operational_migration_state where singleton and imported_at is not null and runtime_primary and cutover_at is not null) then raise exception 'Primary cutover is not ready' using errcode='55000'; end if;
 select * into profile from public.operational_records where document_path='users/'||p_owner_id and owner_id=p_owner_id for update;
 if not found then raise exception 'Owner unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(t),'[]') into tokens from (select distinct value t from jsonb_array_elements_text(case when jsonb_typeof(profile.data->'fcmTokens')='array' then profile.data->'fcmTokens' else '[]' end) where length(value) between 20 and 4096 and value ~ '^[A-Za-z0-9_:\-]+$' order by value limit 20) valid;
 if exists(select 1 from public.operational_records r where r.document_path='users/'||r.owner_id and r.owner_id<>p_owner_id and jsonb_typeof(r.data->'fcmTokens')='array' and exists(select 1 from jsonb_array_elements_text(tokens)t where r.data->'fcmTokens' ? t)) then raise exception 'Push token ownership conflict' using errcode='23505'; end if;
 insert into public.sms_accounts(owner_id) values(p_owner_id) on conflict do nothing;
 update public.sms_accounts set fcm_tokens='[]' where owner_id=p_owner_id;
 for token in select value from jsonb_array_elements_text(tokens) order by value loop perform public.register_push_token(p_owner_id,token,false); end loop;
end $$;
revoke all on function public.operational_register_push_token(text,text,boolean),public.operational_project_push_tokens(text) from public,anon,authenticated;
grant execute on function public.operational_register_push_token(text,text,boolean),public.operational_project_push_tokens(text) to service_role;
commit;
