-- Reliable in-database scheduler for the ESPN result sync.
--
-- Why this exists: the GitHub Actions cron (.github/workflows/sync-matches.yml)
-- is "best-effort" — GitHub silently drops high-frequency scheduled runs during
-- peak load. On 2026-06-11 it left a ~40-minute gap right as Mexico's opener
-- went final, so the result never posted to the leaderboard until a manual
-- dispatch. pg_cron runs *inside* Postgres on a deterministic timer, so it does
-- not get throttled. GitHub Actions stays in place as a redundant backup — the
-- /api/sync/matches endpoint is idempotent, so two schedulers hitting it is safe.
--
-- It fires net.http_post against the same endpoint the GitHub workflow uses,
-- with the same Authorization: Bearer <CRON_SECRET> the route already accepts.
--
-- ONE-TIME MANUAL STEP (do this in the Supabase SQL editor BEFORE running this
-- migration — the secret must NOT be committed to git):
--
--   select vault.create_secret(
--     '<your CRON_SECRET value>',   -- same value as the Vercel env var
--     'wc26_cron_secret',
--     'Bearer secret for /api/sync/matches'
--   );
--
-- pg_cron uses UTC. Window 0-7,15-23 mirrors the GitHub workflow: covers the
-- earliest kickoff (16:00 UTC) through the latest finals (~06:00 UTC) + buffer.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent (re-)scheduling: drop any prior job of this name first so this
-- migration can be re-applied safely.
do $$
begin
  perform cron.unschedule('wc26-sync-matches');
exception
  when others then null;  -- job didn't exist yet
end $$;

select cron.schedule(
  'wc26-sync-matches',
  '*/3 0-7,15-23 * * *',
  $job$
  select net.http_post(
    url     := 'https://wc26-nine.vercel.app/api/sync/matches?apply=1',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'wc26_cron_secret'
      ),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $job$
);
