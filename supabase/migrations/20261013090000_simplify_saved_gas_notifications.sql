-- Simplify saved gas alert wording while preserving the original event timestamp.
begin;
do $migration$
declare
 definition text;
 old_time constant text := $$'Mon DD, YYYY, FMHH12:MI:SS AM'$$;
 old_prefix constant text := $$'Saved gas detection at '$$;
 old_suffix constant text := $$'. Uploaded after the event; check gas history for the recorded readings.'$$;
 old_title constant text := $$title||' (saved detection)'$$;
begin
 definition := pg_catalog.pg_get_functiondef('public.queue_missed_gas_event(public.operational_records)'::regprocedure);
 if position(old_time in definition) = 0 or position(old_prefix in definition) = 0 or
    position(old_suffix in definition) = 0 or position(old_title in definition) = 0 then
  raise exception 'Expected saved gas notification text not found; migration was not applied';
 end if;
 definition := replace(definition, old_time, $$'Mon DD, YYYY, FMHH12:MI AM'$$);
 definition := replace(definition, old_prefix, $$'Odor detected at '$$);
 definition := replace(definition, old_suffix, $$'. Check the litter box and ventilation.'$$);
 definition := replace(definition, old_title, 'title');
 execute definition;
end $migration$;
commit;
