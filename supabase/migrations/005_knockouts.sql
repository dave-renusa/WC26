-- Seed all 31 knockout match rows.
--
-- team_a_id / team_b_id stay NULL until the ESPN sync populates them after
-- groups end. The team_a_from_match_id / team_b_from_match_id references wire
-- the standard single-elimination bracket tree:
--   R16 slot k → winners of R32 (2k-1) and R32 (2k)
--   QF  slot k → winners of R16 (2k-1) and R16 (2k)
--   SF  slot k → winners of QF  (2k-1) and QF  (2k)
--   Final     → winners of SF 1 and SF 2
--
-- Kickoff dates are approximate per FIFA's published 2026 schedule. They'll
-- get overwritten by the sync engine with ESPN's actual times once events
-- appear in the scoreboard endpoint. The approximation just needs to be close
-- enough for date-proximity matching to work (~±24h tolerance).

-- ─────────────────────────────────────────────────────────
-- Round of 32 (June 28 – July 3, 2026)
-- ─────────────────────────────────────────────────────────
insert into matches (stage, bracket_slot, kickoff_at, venue) values
  ('r32',  1, '2026-06-28 16:00:00+00', 'TBD'),
  ('r32',  2, '2026-06-28 20:00:00+00', 'TBD'),
  ('r32',  3, '2026-06-29 16:00:00+00', 'TBD'),
  ('r32',  4, '2026-06-29 20:00:00+00', 'TBD'),
  ('r32',  5, '2026-06-30 16:00:00+00', 'TBD'),
  ('r32',  6, '2026-06-30 20:00:00+00', 'TBD'),
  ('r32',  7, '2026-07-01 16:00:00+00', 'TBD'),
  ('r32',  8, '2026-07-01 20:00:00+00', 'TBD'),
  ('r32',  9, '2026-07-01 23:00:00+00', 'TBD'),
  ('r32', 10, '2026-07-02 16:00:00+00', 'TBD'),
  ('r32', 11, '2026-07-02 19:00:00+00', 'TBD'),
  ('r32', 12, '2026-07-02 22:00:00+00', 'TBD'),
  ('r32', 13, '2026-07-02 23:00:00+00', 'TBD'),
  ('r32', 14, '2026-07-03 16:00:00+00', 'TBD'),
  ('r32', 15, '2026-07-03 20:00:00+00', 'TBD'),
  ('r32', 16, '2026-07-03 23:00:00+00', 'TBD');

-- ─────────────────────────────────────────────────────────
-- Round of 16 (July 4 – July 7, 2026)
-- ─────────────────────────────────────────────────────────
insert into matches (stage, bracket_slot, kickoff_at, venue, team_a_from_match_id, team_b_from_match_id)
select
  'r16', slot,
  ('2026-07-04 16:00:00+00'::timestamptz + ((slot - 1) * interval '12 hours')),
  'TBD',
  (select id from matches where stage = 'r32' and bracket_slot = 2 * slot - 1),
  (select id from matches where stage = 'r32' and bracket_slot = 2 * slot)
from generate_series(1, 8) as slot;

-- ─────────────────────────────────────────────────────────
-- Quarterfinals (July 9 – July 11, 2026)
-- ─────────────────────────────────────────────────────────
insert into matches (stage, bracket_slot, kickoff_at, venue, team_a_from_match_id, team_b_from_match_id)
select
  'qf', slot,
  ('2026-07-09 16:00:00+00'::timestamptz + ((slot - 1) * interval '20 hours')),
  'TBD',
  (select id from matches where stage = 'r16' and bracket_slot = 2 * slot - 1),
  (select id from matches where stage = 'r16' and bracket_slot = 2 * slot)
from generate_series(1, 4) as slot;

-- ─────────────────────────────────────────────────────────
-- Semifinals (July 14 – July 15, 2026)
-- ─────────────────────────────────────────────────────────
insert into matches (stage, bracket_slot, kickoff_at, venue, team_a_from_match_id, team_b_from_match_id)
select
  'sf', slot,
  ('2026-07-14 20:00:00+00'::timestamptz + ((slot - 1) * interval '24 hours')),
  'TBD',
  (select id from matches where stage = 'qf' and bracket_slot = 2 * slot - 1),
  (select id from matches where stage = 'qf' and bracket_slot = 2 * slot)
from generate_series(1, 2) as slot;

-- ─────────────────────────────────────────────────────────
-- Final (July 19, 2026)
-- ─────────────────────────────────────────────────────────
insert into matches (stage, bracket_slot, kickoff_at, venue, team_a_from_match_id, team_b_from_match_id)
values (
  'final', 1, '2026-07-19 19:00:00+00', 'MetLife Stadium, East Rutherford',
  (select id from matches where stage = 'sf' and bracket_slot = 1),
  (select id from matches where stage = 'sf' and bracket_slot = 2)
);
