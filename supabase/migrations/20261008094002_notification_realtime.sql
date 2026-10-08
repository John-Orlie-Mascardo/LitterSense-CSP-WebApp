begin;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='operational_records') then
  alter publication supabase_realtime add table public.operational_records;
 end if;
end $$;
create or replace function public.save_gas_notification_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.reason not in ('Ammonia detected','Hydrogen sulfide detected')
  or not exists(select 1 from public.operational_migration_state where singleton=true and runtime_primary=true)
 then return new; end if;
 insert into public.operational_records(document_path,owner_id,data)
 values('users/'||new.owner_id||'/notifications/gas_'||new.id::text,new.owner_id,
  jsonb_build_object('type','health','source',case when new.reason='Ammonia detected' then 'ammonia_alert' else 'h2s_alert' end,
   'title',case when new.reason='Ammonia detected' then 'Urine detected' else 'Stool detected' end,
   'message','Odor detected near the litter box. Check the litter box and ventilation.',
   'route','/dashboard','createdAt',new.created_at,'isRead',false))
 on conflict(document_path) do nothing;
 return new;
end $$;
revoke all on function public.save_gas_notification_history() from public,anon,authenticated;
drop trigger if exists save_gas_notification_history on public.sms_outbox;
create trigger save_gas_notification_history after insert on public.sms_outbox
for each row execute function public.save_gas_notification_history();
commit;
