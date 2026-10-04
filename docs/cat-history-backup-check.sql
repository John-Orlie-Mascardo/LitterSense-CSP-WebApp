-- Assertions use synthetic owners and roll back all rows. No SMS queue writes.
begin;
do $$
declare c jsonb; v jsonb; r jsonb; q jsonb; a jsonb; b jsonb; item jsonb; i integer; claim uuid; old_claim uuid; rejected boolean; owner_a text:='cat-backup-test-a'; owner_b text:='cat-backup-test-b';
begin
 c:=jsonb_build_object('revision',1,'sourceReadAt',clock_timestamp(),'complete',true,'profiles',jsonb_build_array(jsonb_build_object('catId','cat-a','cat',jsonb_build_object('name','Test'),'details',jsonb_build_object('rfidTag','AABB'))));
 perform public.cat_history_save_catalog(owner_a,c);
 perform public.cat_history_save_catalog(owner_b,c);
 if public.cat_history_read_catalog('cat-backup-no-owner') is not null then raise exception 'Owner isolation failed'; end if;
 insert into public.sms_devices(token_hash,owner_id) values(repeat('a',64),owner_a);
 if public.cat_history_resolve_device(repeat('a',64))->>'ownerId'<>owner_a or public.cat_history_resolve_device(repeat('b',64)) is not null then raise exception 'Device resolution failed'; end if;
 v:=jsonb_build_object('sessionId','original-id','catId','cat-a','data',jsonb_build_object('catId','cat-a','date','2026-10-04','durationSecs',32,'startedAt','2026-10-04T08:00:00Z','endedAt','2026-10-04T08:00:32Z','sessionStatus','NORMAL'),'digest',repeat('c',64),'tokenHash',repeat('a',64),'state','primary_saved');
 r:=public.cat_history_save_visits(owner_a,jsonb_build_array(v));
 if r->>'inserted'<>'1' then raise exception 'Initial insert failed'; end if;
 r:=public.cat_history_save_visits(owner_a,jsonb_build_array(v));
 if r->>'duplicates'<>'1' or (select count(*) from public.cat_visit_backups where owner_id=owner_a)<>1 then raise exception 'Retry duplicated visit'; end if;
 r:=public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(v,'{data,durationSecs}','33')));
 if r->>'conflicts'<>'1' or (select state from public.cat_visit_backups where owner_id=owner_a and session_id='original-id')<>'primary_saved' or (select data->>'durationSecs' from public.cat_visit_backups where owner_id=owner_a and session_id='original-id')<>'32' then raise exception 'Conflict overwrote saved history'; end if;
 q:=jsonb_build_object('startDate','2026-10-01','endDate','2026-10-04','sort','desc','limit',1);
 if jsonb_array_length(public.cat_history_read_visits(owner_b,q)->'rows')<>0 then raise exception 'Cross owner history'; end if;
 v:=jsonb_set(jsonb_set(v,'{sessionId}','"pending-id"'),'{state}','"pending"');
 perform public.cat_history_save_visits(owner_a,jsonb_build_array(v));
 a:=public.cat_history_claim_visits(5);
 b:=public.cat_history_claim_visits(5);
 if jsonb_array_length(a)<>1 or jsonb_array_length(b)<>0 then raise exception 'Overlapping claims'; end if;
 claim:=(a->0->>'claimId')::uuid;
 if (a->0->>'leaseUntil')::timestamptz not between clock_timestamp()+interval '119 seconds' and clock_timestamp()+interval '121 seconds' then raise exception 'Bad lease duration'; end if;
 rejected:=false;
 begin perform public.cat_history_finish_claim(gen_random_uuid(),'primary_saved'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Stale claim accepted'; end if;
 update public.cat_visit_backups set lease_until=clock_timestamp()-interval '1 second' where owner_id=owner_a and session_id='pending-id';
 rejected:=false;
 begin perform public.cat_history_finish_claim(claim,'primary_saved'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Expired claim accepted'; end if;
 old_claim:=claim; a:=public.cat_history_claim_visits(5); claim:=(a->0->>'claimId')::uuid;
 if claim=old_claim then raise exception 'Claim not rotated'; end if;
 perform public.cat_history_finish_claim(claim,'retry');
 if (select next_attempt_at from public.cat_visit_backups where owner_id=owner_a and session_id='pending-id') not between clock_timestamp()+interval '59 seconds' and clock_timestamp()+interval '61 seconds' then raise exception 'Retry backoff wrong'; end if;
 update public.cat_visit_backups set next_attempt_at=clock_timestamp()-interval '1 second',attempts=30 where owner_id=owner_a and session_id='pending-id';
 a:=public.cat_history_claim_visits(5); claim:=(a->0->>'claimId')::uuid; perform public.cat_history_finish_claim(claim,'retry');
 if (select next_attempt_at from public.cat_visit_backups where owner_id=owner_a and session_id='pending-id') not between clock_timestamp()+interval '899 seconds' and clock_timestamp()+interval '901 seconds' then raise exception 'Backoff cap wrong'; end if;
 update public.cat_visit_backups set next_attempt_at=clock_timestamp()-interval '1 second' where owner_id=owner_a and session_id='pending-id';
 a:=public.cat_history_claim_visits(5); perform public.cat_history_finish_claim((a->0->>'claimId')::uuid,'cancelled');
 if jsonb_array_length(public.cat_history_claim_visits(5))<>0 then raise exception 'Cancelled visit retried'; end if;
 -- Pagination is deterministic, preserves original IDs and binds owner and filters.
 perform public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(jsonb_set(v,'{sessionId}','"second-id"'),'{state}','"primary_saved"')));
 r:=public.cat_history_read_visits(owner_a,q);
 if jsonb_array_length(r->'rows')<>1 or r->>'nextCursor' is null then raise exception 'Pagination failed'; end if;
 b:=public.cat_history_read_visits(owner_a,q||jsonb_build_object('cursor',r->>'nextCursor'));
 if b->'rows'->0->>'sessionId'=r->'rows'->0->>'sessionId' or b->>'nextCursor' is not null then raise exception 'Pagination duplicated or truncated'; end if;
 for i in 1..7 loop
  perform public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(v,'{sessionId}',to_jsonb('bounded-'||i))));
 end loop;
 a:=public.cat_history_claim_visits(5); b:=public.cat_history_claim_visits(5);
 if jsonb_array_length(a)<>5 or jsonb_array_length(b)<>2 then raise exception 'Claim batch bound failed'; end if;
 if exists(select 1 from jsonb_array_elements(a) x join jsonb_array_elements(b) y on x->>'sessionId'=y->>'sessionId') then raise exception 'Workers shared a claimed row'; end if;
 for item in select value from jsonb_array_elements(a) loop
  -- Identical pending retry must not reset its live claim.
  perform public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(v,'{sessionId}',item->'sessionId')));
  if (select claim_id from public.cat_visit_backups where owner_id=owner_a and session_id=item->>'sessionId') is distinct from (item->>'claimId')::uuid then raise exception 'Retry reset claim'; end if;
  perform public.cat_history_finish_claim((item->>'claimId')::uuid,'conflict');
 end loop;
 for item in select value from jsonb_array_elements(b) loop
  perform public.cat_history_finish_claim((item->>'claimId')::uuid,'cancelled');
 end loop;
 if jsonb_array_length(public.cat_history_claim_visits(5))<>0 then raise exception 'Terminal visits retried'; end if;
 rejected:=false;
 begin perform public.cat_history_read_visits(owner_b,q||jsonb_build_object('cursor',r->>'nextCursor')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Cross owner cursor accepted'; end if;
 -- Complete empty catalog means deletion; old/partial catalogs cannot undo it.
 perform public.cat_history_save_catalog(owner_a,jsonb_set(jsonb_set(c,'{revision}','2'),'{profiles}','[]'));
 if jsonb_array_length(public.cat_history_read_catalog(owner_a)->'profiles')<>0 or not (select deleted from public.cat_profile_backups where owner_id=owner_a and cat_id='cat-a') then raise exception 'Deletion tombstone missing'; end if;
 if public.cat_history_save_catalog(owner_a,c)->>'applied'<>'false' or jsonb_array_length(public.cat_history_read_catalog(owner_a)->'profiles')<>0 then raise exception 'Old catalog undid deletion'; end if;
 rejected:=false;
 begin perform public.cat_history_save_catalog(owner_a,jsonb_set(jsonb_set(c,'{revision}','3'),'{complete}','false')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Partial catalog applied'; end if;
 rejected:=false;
 begin perform public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(v,'{sessionId}','"deleted-cat-pending"'))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Deleted cat authorized queue'; end if;
 delete from public.sms_devices where token_hash=repeat('a',64);
 if public.cat_history_resolve_device(repeat('a',64)) is not null or (select count(*) from public.cat_visit_backups where owner_id=owner_a and state='primary_saved')<>2 then raise exception 'Rotation lost saved visits'; end if;
 rejected:=false;
 begin perform public.cat_history_save_visits(owner_a,jsonb_build_array(jsonb_set(v,'{sessionId}','"revoked-pending"'))); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Revoked device authorized queue'; end if;
 -- Progress and independent repair leases.
 perform public.cat_history_save_progress(owner_a,jsonb_build_object('cursor','page-a','scanned',100,'complete',false,'checkedAt',clock_timestamp(),'lastError',null));
 rejected:=false;
 begin perform public.cat_history_save_progress(owner_a,jsonb_build_object('cursor',null,'scanned',0,'complete',false,'checkedAt',clock_timestamp(),'lastError',null)); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Progress regressed'; end if;
 a:=public.cat_history_claim_repair_owner(); b:=public.cat_history_claim_repair_owner();
 if a->>'ownerId'=b->>'ownerId' then raise exception 'Repair claims overlap'; end if;
 claim:=(a->>'claimId')::uuid;
 update public.cat_history_backup_progress set repair_lease_until=clock_timestamp()-interval '1 second' where repair_claim_id=claim;
 rejected:=false;
 begin perform public.cat_history_finish_repair_owner(claim,'success'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Expired repair claim accepted'; end if;
 a:=public.cat_history_claim_repair_owner(); claim:=(a->>'claimId')::uuid;
 perform public.cat_history_finish_repair_owner(claim,'retry');
 rejected:=false;
 begin perform public.cat_history_finish_repair_owner(claim,'success'); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Stale repair claim accepted'; end if;
 -- Role ACL + RLS assertions cover every new object including helpers.
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('cat_backup_catalogs','cat_profile_backups','cat_visit_backups','cat_history_backup_progress') and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE'))) then raise exception 'Browser table access'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cat_history_%' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or not has_function_privilege('service_role',p.oid,'EXECUTE'))) then raise exception 'Browser RPC access'; end if;
 delete from public.sms_accounts where owner_id=owner_a;
 if exists(select 1 from public.cat_backup_catalogs where owner_id=owner_a) or exists(select 1 from public.cat_profile_backups where owner_id=owner_a) or exists(select 1 from public.cat_visit_backups where owner_id=owner_a) or exists(select 1 from public.cat_history_backup_progress where owner_id=owner_a) then raise exception 'Account cascade incomplete'; end if;
end $$;
rollback;
