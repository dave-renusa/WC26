-- Re-map the knockout bracket to FIFA's OFFICIAL 2026 match numbering and the
-- real single-elimination tree, and pin the group winners already locked in.
--
-- WHY THIS EXISTS
-- ---------------
-- 005_knockouts.sql seeded the knockout rows with two approximations that this
-- migration corrects now that ESPN has published the real bracket:
--
--   1. bracket_slot was 1..16 / 1..8 / ... (chronological), so cards rendered
--      as "M1, M2 ...". FIFA numbers the knockout games 73..104. Our match `id`
--      already happens to equal the FIFA number (group games took ids 1..72,
--      then R32=73..88, R16=89..96, QF=97..100, SF=101..102, Final=103). So we
--      just set bracket_slot = the FIFA match number (Final = 104; FIFA's 103 is
--      the third-place playoff, which this pool does not run).
--
--   2. The R16+ tree used the naive pairing (R16 #k <- R32 2k-1, 2k). FIFA's
--      real bracket crosses differently (e.g. R16 #89 = winners of R32 #74 and
--      #77, NOT #73 and #74). This rewires team_a_from_match_id /
--      team_b_from_match_id to the authoritative tree so the cascade is correct.
--
-- Also: accurate kickoff times (UTC) and venues per the published schedule, and
-- the four group winners ESPN has already locked into their R32 slots
-- (Germany #74, Mexico #79, USA #81, Argentina #86) are pinned as team_a so they
-- show on the bracket immediately. Their opponents stay NULL until the ESPN
-- populate fills them when groups end (resolve.ts now fills the empty side of a
-- half-populated row — see the "single-side" phase).
--
-- Safe to run: there are zero knockout picks yet (bracket opens June 28), so
-- nothing references these matchups. Idempotent (plain UPDATEs keyed by id).

-- ─────────────────────────────────────────────────────────
-- Round of 32 (ids/FIFA# 73-88). Source slots noted in comments.
-- Kickoffs converted to UTC from the published venue-local times.
-- ─────────────────────────────────────────────────────────
update matches set bracket_slot = 73, kickoff_at = '2026-06-28 19:00:00+00', venue = 'SoFi Stadium, Inglewood'              where id = 73; -- 2A v 2B
update matches set bracket_slot = 74, kickoff_at = '2026-06-29 20:30:00+00', venue = 'Gillette Stadium, Foxborough',      team_a_id = 17 where id = 74; -- 1E (Germany) v 3rd[A/B/C/D/F]
update matches set bracket_slot = 75, kickoff_at = '2026-06-30 01:00:00+00', venue = 'Estadio BBVA, Guadalupe'              where id = 75; -- 1F v 2C
update matches set bracket_slot = 76, kickoff_at = '2026-06-29 17:00:00+00', venue = 'NRG Stadium, Houston'                 where id = 76; -- 1C v 2F
update matches set bracket_slot = 77, kickoff_at = '2026-06-30 21:00:00+00', venue = 'MetLife Stadium, East Rutherford'     where id = 77; -- 1I v 3rd[C/D/F/G/H]
update matches set bracket_slot = 78, kickoff_at = '2026-06-30 17:00:00+00', venue = 'AT&T Stadium, Arlington'              where id = 78; -- 2E v 2I
update matches set bracket_slot = 79, kickoff_at = '2026-07-01 01:00:00+00', venue = 'Estadio Azteca, Mexico City',        team_a_id = 1  where id = 79; -- 1A (Mexico) v 3rd[C/E/F/H/I]
update matches set bracket_slot = 80, kickoff_at = '2026-07-01 16:00:00+00', venue = 'Mercedes-Benz Stadium, Atlanta'       where id = 80; -- 1L v 3rd[E/H/I/J/K]
update matches set bracket_slot = 81, kickoff_at = '2026-07-02 00:00:00+00', venue = 'Levi''s Stadium, Santa Clara',       team_a_id = 13 where id = 81; -- 1D (USA) v 3rd[B/E/F/I/J]
update matches set bracket_slot = 82, kickoff_at = '2026-07-01 20:00:00+00', venue = 'Lumen Field, Seattle'                 where id = 82; -- 1G v 3rd[A/E/H/I/J]
update matches set bracket_slot = 83, kickoff_at = '2026-07-02 23:00:00+00', venue = 'BMO Field, Toronto'                   where id = 83; -- 2K v 2L
update matches set bracket_slot = 84, kickoff_at = '2026-07-02 19:00:00+00', venue = 'SoFi Stadium, Inglewood'              where id = 84; -- 1H v 2J
update matches set bracket_slot = 85, kickoff_at = '2026-07-03 03:00:00+00', venue = 'BC Place, Vancouver'                  where id = 85; -- 1B v 3rd[E/F/G/I/J]
update matches set bracket_slot = 86, kickoff_at = '2026-07-03 22:00:00+00', venue = 'Hard Rock Stadium, Miami Gardens',   team_a_id = 37 where id = 86; -- 1J (Argentina) v 2H
update matches set bracket_slot = 87, kickoff_at = '2026-07-04 01:30:00+00', venue = 'Arrowhead Stadium, Kansas City'       where id = 87; -- 1K v 3rd[D/E/I/J/L]
update matches set bracket_slot = 88, kickoff_at = '2026-07-03 18:00:00+00', venue = 'AT&T Stadium, Arlington'              where id = 88; -- 2D v 2G

-- ─────────────────────────────────────────────────────────
-- Round of 16 (ids/FIFA# 89-96). Rewire to the real FIFA tree.
-- ─────────────────────────────────────────────────────────
update matches set bracket_slot = 89, kickoff_at = '2026-07-04 21:00:00+00', venue = 'Lincoln Financial Field, Philadelphia', team_a_from_match_id = 74, team_b_from_match_id = 77 where id = 89; -- W74 v W77
update matches set bracket_slot = 90, kickoff_at = '2026-07-04 17:00:00+00', venue = 'NRG Stadium, Houston',                   team_a_from_match_id = 73, team_b_from_match_id = 75 where id = 90; -- W73 v W75
update matches set bracket_slot = 91, kickoff_at = '2026-07-05 20:00:00+00', venue = 'MetLife Stadium, East Rutherford',       team_a_from_match_id = 76, team_b_from_match_id = 78 where id = 91; -- W76 v W78
update matches set bracket_slot = 92, kickoff_at = '2026-07-06 00:00:00+00', venue = 'Estadio Azteca, Mexico City',            team_a_from_match_id = 79, team_b_from_match_id = 80 where id = 92; -- W79 v W80
update matches set bracket_slot = 93, kickoff_at = '2026-07-06 19:00:00+00', venue = 'AT&T Stadium, Arlington',               team_a_from_match_id = 83, team_b_from_match_id = 84 where id = 93; -- W83 v W84
update matches set bracket_slot = 94, kickoff_at = '2026-07-07 00:00:00+00', venue = 'Lumen Field, Seattle',                  team_a_from_match_id = 81, team_b_from_match_id = 82 where id = 94; -- W81 v W82
update matches set bracket_slot = 95, kickoff_at = '2026-07-07 16:00:00+00', venue = 'Mercedes-Benz Stadium, Atlanta',        team_a_from_match_id = 86, team_b_from_match_id = 88 where id = 95; -- W86 v W88
update matches set bracket_slot = 96, kickoff_at = '2026-07-07 20:00:00+00', venue = 'BC Place, Vancouver',                   team_a_from_match_id = 85, team_b_from_match_id = 87 where id = 96; -- W85 v W87

-- ─────────────────────────────────────────────────────────
-- Quarterfinals (ids/FIFA# 97-100).
-- ─────────────────────────────────────────────────────────
update matches set bracket_slot = 97,  kickoff_at = '2026-07-09 20:00:00+00', venue = 'Gillette Stadium, Foxborough',     team_a_from_match_id = 89, team_b_from_match_id = 90 where id = 97;  -- W89 v W90
update matches set bracket_slot = 98,  kickoff_at = '2026-07-10 19:00:00+00', venue = 'SoFi Stadium, Inglewood',          team_a_from_match_id = 93, team_b_from_match_id = 94 where id = 98;  -- W93 v W94
update matches set bracket_slot = 99,  kickoff_at = '2026-07-11 21:00:00+00', venue = 'Hard Rock Stadium, Miami Gardens', team_a_from_match_id = 91, team_b_from_match_id = 92 where id = 99;  -- W91 v W92
update matches set bracket_slot = 100, kickoff_at = '2026-07-12 01:00:00+00', venue = 'Arrowhead Stadium, Kansas City',   team_a_from_match_id = 95, team_b_from_match_id = 96 where id = 100; -- W95 v W96

-- ─────────────────────────────────────────────────────────
-- Semifinals (ids/FIFA# 101-102).
-- ─────────────────────────────────────────────────────────
update matches set bracket_slot = 101, kickoff_at = '2026-07-14 19:00:00+00', venue = 'AT&T Stadium, Arlington',        team_a_from_match_id = 97, team_b_from_match_id = 98  where id = 101; -- W97 v W98
update matches set bracket_slot = 102, kickoff_at = '2026-07-15 19:00:00+00', venue = 'Mercedes-Benz Stadium, Atlanta', team_a_from_match_id = 99, team_b_from_match_id = 100 where id = 102; -- W99 v W100

-- ─────────────────────────────────────────────────────────
-- Final (id 103 -> FIFA match #104). Tree already correct (W101 v W102).
-- ─────────────────────────────────────────────────────────
update matches set bracket_slot = 104, kickoff_at = '2026-07-19 19:00:00+00', venue = 'MetLife Stadium, East Rutherford', team_a_from_match_id = 101, team_b_from_match_id = 102 where id = 103; -- W101 v W102
