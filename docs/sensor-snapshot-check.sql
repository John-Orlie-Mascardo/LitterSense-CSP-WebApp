begin;
do $$
declare receipt timestamptz:=clock_timestamp()-interval '10 seconds'; before_time timestamptz; snapshots jsonb;
begin
 perform public.remember_sensor_device('sensor-mirror-test-a',repeat('1',64));
 perform public.remember_sensor_device('sensor-mirror-test-b',repeat('2',64));
 update public.sms_accounts set sms_enabled=true,sms_phone_number='+639171234567',notifications='{"healthAlerts":false}',cats='[{"id":"test-cat"}]' where owner_id='sensor-mirror-test-a';
 perform public.remember_sensor_device('sensor-mirror-test-a',repeat('3',64));
 if (select count(*) from public.sms_devices where owner_id='sensor-mirror-test-a')<>2 then raise exception 'Mapping maintenance removed other devices'; end if;
 if not exists(select 1 from public.sms_accounts where owner_id='sensor-mirror-test-a' and sms_enabled and notifications->>'healthAlerts'='false' and jsonb_array_length(cats)=1) then raise exception 'Mapping maintenance changed SMS settings'; end if;
 if public.save_sensor_mirror(repeat('4',64),'rfid','{}',receipt) then raise exception 'Unknown token accepted'; end if;
 perform public.save_sensor_mirror(repeat('1',64),'rfid','{"sessionActive":true,"rfidHex":"AABB"}',receipt);
 perform public.save_sensor_mirror(repeat('1',64),'gas-ultrasonic','{"mq135Raw":1,"mq136Raw":1,"distanceCm":12}',receipt);
 perform public.save_sensor_mirror(repeat('1',64),'rfid','{"sessionActive":false}',receipt+interval '1 second');
 perform public.save_sensor_mirror(repeat('1',64),'rfid','{"sessionActive":true}',receipt);
 if not exists(select 1 from public.sensor_snapshots where token_hash=repeat('1',64) and source='rfid' and data->>'sessionActive'='false' and data->>'rfidHex'='AABB' and received_at=receipt+interval '1 second') then raise exception 'Partial merge or delayed write guard failed'; end if;
 if not exists(select 1 from public.sensor_snapshots where token_hash=repeat('1',64) and source='gas-ultrasonic' and received_at=receipt) then raise exception 'Independent source timestamp changed'; end if;
 snapshots:=public.read_sensor_mirrors('sensor-mirror-test-b');
 if jsonb_array_length(snapshots)<>0 then raise exception 'Owner isolation failed'; end if;
 snapshots:=public.read_sensor_mirrors('sensor-mirror-test-a');
 if jsonb_array_length(snapshots)<>2 then raise exception 'Owner snapshot read failed'; end if;
 select received_at into before_time from public.sensor_snapshots where token_hash=repeat('1',64) and source='rfid';
 perform public.read_sensor_mirrors('sensor-mirror-test-a');
 if (select received_at from public.sensor_snapshots where token_hash=repeat('1',64) and source='rfid')<>before_time then raise exception 'Reading refreshed age'; end if;
 begin
  perform public.remember_sensor_device('sensor-mirror-test-b',repeat('1',64));
  raise exception 'Conflicting owner accepted';
 exception when others then if sqlerrm<>'Sensor ownership conflict' then raise; end if; end;
 begin
  perform public.sync_sms_account('sensor-mirror-test-b','','{}','[]',repeat('1',64));
  raise exception 'Sync reassigned ownership';
 exception when others then if sqlerrm<>'Sensor ownership conflict' then raise; end if; end;
 begin
  perform public.save_sensor_mirror(repeat('1',64),'rfid','{"configToken":"omit"}',receipt);
  raise exception 'Secret fields accepted';
 exception when others then if sqlerrm<>'Invalid sensor fields' then raise; end if; end;
 begin
  perform public.save_sensor_mirror(repeat('1',64),'rfid','{}',clock_timestamp()+interval '1 minute');
  raise exception 'Future receipt accepted';
 exception when others then if sqlerrm<>'Invalid sensor snapshot' then raise; end if; end;
 perform public.sync_sms_account('sensor-mirror-test-a','','{}','[]',repeat('3',64));
 if exists(select 1 from public.sensor_snapshots where token_hash=repeat('1',64)) then raise exception 'Rotation cascade failed'; end if;
 if public.save_sensor_mirror(repeat('1',64),'rfid','{}',receipt) then raise exception 'Revoked token accepted'; end if;
 perform public.save_sensor_mirror(repeat('3',64),'rfid','{}',receipt);
 delete from public.sms_accounts where owner_id='sensor-mirror-test-a';
 if exists(select 1 from public.sensor_snapshots where token_hash=repeat('3',64)) then raise exception 'Account deletion cascade failed'; end if;
 if has_table_privilege('anon','public.sensor_snapshots','select') or has_table_privilege('authenticated','public.sensor_snapshots','select') or has_function_privilege('anon','public.save_sensor_mirror(text,text,jsonb,timestamptz)','execute') or has_function_privilege('authenticated','public.read_sensor_mirrors(text)','execute') then raise exception 'Browser privileges allowed'; end if;
 if not (select relrowsecurity from pg_class where oid='public.sensor_snapshots'::regclass) then raise exception 'RLS disabled'; end if;
end $$;
select 'PASS: ownership, secrets, partial merge, receipt ordering, independent sources, rotation, deletion, grants' as result;
rollback;
