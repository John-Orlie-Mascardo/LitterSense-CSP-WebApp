-- Presentation only: keep the event, timestamp, preferences and queue behavior intact.
begin;
do $migration$
declare
 definition text;
 old_format constant text := $$'Mon DD, YYYY HH24:MI:SS'$$;
 old_suffix constant text := $$' (UTC+08:00). Uploaded after the event; check gas history for the recorded readings.'$$;
begin
 definition := pg_catalog.pg_get_functiondef('public.queue_missed_gas_event(public.operational_records)'::regprocedure);
 if position(old_format in definition) = 0 or position(old_suffix in definition) = 0 then
  raise exception 'Expected saved gas notification format not found; migration was not applied';
 end if;
 definition := replace(definition, old_format, $$'Mon DD, YYYY, FMHH12:MI:SS AM'$$);
 definition := replace(definition, old_suffix, $$'. Uploaded after the event; check gas history for the recorded readings.'$$);
 execute definition;
end $migration$;
commit;
