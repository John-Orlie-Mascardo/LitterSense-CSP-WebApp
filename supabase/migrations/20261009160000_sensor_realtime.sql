begin;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sensor_snapshots') then
  alter publication supabase_realtime add table public.sensor_snapshots;
 end if;
end $$;
-- Server-side subscriptions only. Keep browser access disabled.
commit;
