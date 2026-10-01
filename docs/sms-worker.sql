create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create function public.configure_sms_worker(p_secret text,p_active boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare secret_id uuid; job_id bigint;
begin
 if p_secret !~ '^[a-f0-9]{64}$' then raise exception 'Invalid worker secret'; end if;
 select id into secret_id from vault.secrets where name='littersense_sms_worker';
 if secret_id is null then perform vault.create_secret(p_secret,'littersense_sms_worker');
 else perform vault.update_secret(secret_id,p_secret,'littersense_sms_worker'); end if;
 select cron.schedule('littersense-sms-worker','* * * * *',
 $job$
 delete from public.sms_visits where created_at<now()-interval '30 days';
 delete from public.sms_outbox where created_at<now()-interval '30 days' and status not in ('pending','sending');
 select net.http_post(
  url:='https://litter-sense-csp-web-app.vercel.app/api/sms/process',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='littersense_sms_worker')),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
 $job$) into job_id;
 perform cron.alter_job(job_id,active:=p_active);
 return job_id;
end; $$;
-- Privilege is needed only for Vault and cron administration. Browser roles cannot call this.
revoke all on function public.configure_sms_worker(text,boolean) from public,anon,authenticated;
grant execute on function public.configure_sms_worker(text,boolean) to service_role;
