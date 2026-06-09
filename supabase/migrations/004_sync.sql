-- Live-results sync audit log.
-- Every call to /api/sync/matches writes one row per match it considered, so we
-- can see exactly what the sync changed (or what it would have changed in
-- dry-run mode). Source is 'espn' today; column kept generic for future fallbacks.

create table match_sync_log (
  id         bigserial primary key,
  match_id   int references matches(id) on delete cascade,
  source     text not null default 'espn',
  status     text not null,                              -- 'applied' | 'skipped' | 'planned' | 'error'
  reason     text,                                       -- short human note: 'final', 'not-started', 'admin-locked', 'no-match-found', etc.
  -- snapshot of the proposed change for forensics
  proposed_score_a   int,
  proposed_score_b   int,
  proposed_winner_id int references teams(id),
  prior_score_a      int,
  prior_score_b      int,
  prior_winner_id    int references teams(id),
  dry_run    boolean not null default false,
  payload    jsonb,                                      -- raw ESPN event chunk for the matched fixture
  at         timestamptz not null default now()
);
create index match_sync_log_match_idx on match_sync_log (match_id, at desc);
create index match_sync_log_status_idx on match_sync_log (status, at desc);

alter table match_sync_log enable row level security;

-- Public read so the admin page (and curious users) can see audit trail without
-- needing the service role. Writes are service-role only.
create policy match_sync_log_select on match_sync_log for select using (true);
