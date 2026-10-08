-- Approved deletion remains server only. The existing account FKs remove alert,
-- snapshot and historical backup projections in the same transaction.
begin;
create function public.operational_delete_account(p_owner_id text, p_request_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare req public.operational_records%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(621006, 2);
  select * into req from public.operational_records
    where document_path='deleteRequests/'||p_request_id and owner_id=p_owner_id for update;
  if not found or req.data->>'userId' is distinct from p_owner_id
    or coalesce(req.data->>'status','') not in ('approved','deleting','deleted') then
    raise exception 'Approved owner request required' using errcode='42501';
  end if;
  delete from public.operational_records where owner_id=p_owner_id and document_path<>req.document_path;
  delete from public.sms_accounts where owner_id=p_owner_id;
  update public.operational_records set data=jsonb_set(data,'{status}','"deleting"'),
    revision=revision+1,updated_at=clock_timestamp() where document_path=req.document_path;
end $$;
revoke all on function public.operational_delete_account(text,text) from public,anon,authenticated;
grant execute on function public.operational_delete_account(text,text) to service_role;
create function public.operational_finish_deletion(p_owner_id text, p_request_id text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.operational_records set data=jsonb_set(data,'{status}','"deleted"'),
    revision=revision+1,updated_at=clock_timestamp()
    where owner_id=p_owner_id and document_path='deleteRequests/'||p_request_id
      and data->>'status' in ('deleting','deleted');
  if not found then raise exception 'Deletion not started' using errcode='42501'; end if;
end $$;
revoke all on function public.operational_finish_deletion(text,text) from public,anon,authenticated;
grant execute on function public.operational_finish_deletion(text,text) to service_role;
commit;
