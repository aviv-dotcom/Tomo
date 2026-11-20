-- Tomo 0002: run the background worker every minute from inside the database.
-- pg_cron fires a job; pg_net calls the app's /api/worker with the shared secret.
-- The URL and secret live in Supabase Vault (names: worker_url, worker_secret), never in this repo.
-- Set them once per project:
--   select vault.create_secret('https://<app>/api/worker', 'worker_url');
--   select vault.create_secret('<WORKER_SECRET from Vercel>', 'worker_secret');
-- Where pg_cron or pg_net are not installed (local tests), the schedule is skipped.

-- Calls the worker. Does nothing until both Vault secrets exist.
create function core_kick_worker() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
end $$;

revoke execute on function core_kick_worker() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('tomo-worker', '* * * * *', 'select public.core_kick_worker()');
    perform cron.schedule('tomo-release-stuck-jobs', '*/5 * * * *', 'select public.release_stuck_jobs()');
  else
    raise notice 'pg_cron/pg_net not available: worker schedule skipped';
  end if;
end $$;
