-- Run only after the corrected backend has been deployed and release approval obtained.
-- Requeue original data for the existing count-once recovery worker; do not rewrite history.
begin;
do $$
declare affected integer;
begin
  update public.cat_visit_backups v
  set state='pending', conflict_detected=false,
      reason='Reviewed 32-character firmware retry identifier bug; recheck original visit',
      attempts=0, next_attempt_at=now(), claim_id=null, lease_until=null
  where v.state='conflict' and v.conflict_detected
    and (v.session_id,v.digest) in (
      ('sync_fc98f1d160e7703626347a47ded6cf2d_6281368_6330077','bf75973d542e6a65429b0dd662d2b70cb98c58429d394e4873eabc0372d2cfa4'),
      ('sync_fc98f1d160e7703626347a47ded6cf2d_6799790_6858255','6197d3ba9e97f1f39c386ecb65fcb3f934a2c4bdbec496d07ebb7c4d4e33de74')
    )
    and exists (
      select 1 from public.sms_devices d
      join public.cat_backup_catalogs c on c.owner_id=d.owner_id and c.complete
      join public.cat_profile_backups p on p.owner_id=c.owner_id and not p.deleted
      where d.owner_id=v.owner_id and d.token_hash=v.token_hash and p.cat_id=v.cat_id
    );
  get diagnostics affected=row_count;
  if affected<>2 then raise exception 'Expected exactly two unchanged, authorized quarantined visits; rollback and review'; end if;
end $$;
commit;
