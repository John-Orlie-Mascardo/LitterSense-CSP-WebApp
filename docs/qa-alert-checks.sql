-- Run after the QA migration. No provider sends; all synthetic data rolls back.
begin;
do $$
declare
 owner text:='qa-'||gen_random_uuid()::text;
 token_hash text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
 payload jsonb;
 claimed integer;
begin
 insert into public.sms_accounts(owner_id,phone_number,notifications,cats,sms_enabled,sms_phone_number)
 values(owner,'','{"healthAlerts":true,"ammoniaAlerts":true,"h2sAlerts":true}', '[{"id":"qa-cat","name":"Zeno"}]',false,'+639111111111');
 insert into public.sms_devices(token_hash,owner_id) values(token_hash,owner);
 perform public.register_push_token(owner,'qa-device-token-one-1234567890',false);
 perform public.register_push_token(owner,'qa-device-token-two-1234567890',false);
 if (select jsonb_array_length(fcm_tokens) from public.sms_accounts where owner_id=owner)<>2 then raise exception 'Multiple devices lost'; end if;
 payload:=jsonb_build_array(jsonb_build_object('catId','qa-cat','eventId','qa-event','occurredAt',now(),'durationSecs',300,'reason','Extended duration'));
 perform public.ingest_sensor_sms(token_hash,payload,null,6);
 perform public.ingest_sensor_sms(token_hash,payload,null,6);
 if (select count(*) from public.sms_outbox where owner_id=owner)<>1 then raise exception 'Retry duplicated alert'; end if;
 if (select (context->>'durationSecs')::integer from public.sms_outbox where owner_id=owner)<>300 then raise exception 'Duration context missing'; end if;
 select count(*) into claimed from public.claim_sms_outbox(owner,2);
 if claimed<>0 then raise exception 'Invalid profile sent SMS'; end if;
 select count(*) into claimed from public.claim_push_outbox(owner,2);
 if claimed<>1 then raise exception 'Missing phone blocked push'; end if;
 select count(*) into claimed from public.claim_push_outbox(owner,2);
 if claimed<>0 then raise exception 'Push claimed twice'; end if;
 perform public.ingest_sensor_sms(token_hash,'[]','{"ammonia":true,"h2s":true}',6);
 if (select count(*) from public.sms_outbox where owner_id=owner and cat_id is null)<>2 then raise exception 'Gas alerts combined or missing'; end if;
 update public.sms_accounts set notifications='{"quietHours":{"enabled":true,"from":"00:00","to":"00:00"}}' where owner_id=owner;
 select count(*) into claimed from public.claim_push_outbox(owner,2);
 if claimed<>0 then raise exception 'Quiet hours ignored'; end if;
 update public.sms_accounts set phone_number='+639000000000',notifications='{}' where owner_id=owner;
 insert into public.sms_outbox(event_key,owner_id,reason,message,push_status) values(gen_random_uuid()::text,owner,'Test SMS','qa','cancelled');
 select count(*) into claimed from public.claim_sms_outbox(owner,2);
 if claimed<>2 then raise exception 'Profile phone did not supersede disabled legacy settings'; end if;
 if has_function_privilege('anon','public.claim_push_outbox(text,integer)','execute') then raise exception 'Public push claim access'; end if;
end $$;
rollback;
