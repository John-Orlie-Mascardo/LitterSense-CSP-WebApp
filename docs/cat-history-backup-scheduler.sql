-- Apply only after deployed recovery gate and initial-copy checks pass.
-- Store CAT_HISTORY_PROCESS_SECRET in Supabase Vault as
-- littersense_cat_history_worker before scheduling. Never place the value here.
select cron.schedule('littersense-cat-history-worker', '* * * * *', $job$
  select net.http_post(
    url := 'https://litter-sense-csp-web-app.vercel.app/api/cat-backup/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'littersense_cat_history_worker')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- Rollback first step: select cron.unschedule('littersense-cat-history-worker');
