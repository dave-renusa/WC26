-- All 72 group-stage matches for the 2026 FIFA World Cup.
-- Schedule sourced from the published FIFA fixture list (per ESPN's published
-- schedule). All kickoffs stored in UTC. Stadium-local hours noted in comments.
--
-- Pattern is FIFA's standard 2026 rotation, not classic round-robin, so we
-- can't generate it from slot pairs — every match is listed explicitly.

with schedule(group_code, matchday, team_a_code, team_b_code, kickoff_at, venue) as (
  values
    -- ─── Matchday 1 (June 11–17) ────────────────────────────────────────────
    -- June 11
    ('A', 1, 'MEX', 'RSA', '2026-06-11 19:00:00+00'::timestamptz, 'Estadio Azteca, Mexico City'),       -- 1:00 PM local
    ('A', 1, 'KOR', 'CZE', '2026-06-12 02:00:00+00'::timestamptz, 'Estadio Akron, Zapopan'),            -- 8:00 PM local
    -- June 12
    ('B', 1, 'CAN', 'BIH', '2026-06-12 19:00:00+00'::timestamptz, 'BMO Field, Toronto'),                -- 3:00 PM ET
    ('D', 1, 'USA', 'PAR', '2026-06-13 01:00:00+00'::timestamptz, 'SoFi Stadium, Inglewood'),           -- 6:00 PM PT
    -- June 13
    ('B', 1, 'QAT', 'SUI', '2026-06-13 19:00:00+00'::timestamptz, 'Levi''s Stadium, Santa Clara'),      -- 12:00 PM PT
    ('C', 1, 'BRA', 'MAR', '2026-06-13 22:00:00+00'::timestamptz, 'MetLife Stadium, East Rutherford'),  -- 6:00 PM ET
    ('C', 1, 'HAI', 'SCO', '2026-06-14 01:00:00+00'::timestamptz, 'Gillette Stadium, Foxborough'),      -- 9:00 PM ET
    ('D', 1, 'AUS', 'TUR', '2026-06-14 04:00:00+00'::timestamptz, 'BC Place, Vancouver'),               -- 9:00 PM PT
    -- June 14
    ('E', 1, 'GER', 'CUW', '2026-06-14 17:00:00+00'::timestamptz, 'NRG Stadium, Houston'),              -- 12:00 PM CT
    ('F', 1, 'NED', 'JPN', '2026-06-14 20:00:00+00'::timestamptz, 'AT&T Stadium, Arlington'),           -- 3:00 PM CT
    ('E', 1, 'CIV', 'ECU', '2026-06-14 23:00:00+00'::timestamptz, 'Lincoln Financial Field, Philadelphia'), -- 7:00 PM ET
    ('F', 1, 'SWE', 'TUN', '2026-06-15 02:00:00+00'::timestamptz, 'Estadio Monterrey, Guadalupe'),      -- 8:00 PM local
    -- June 15
    ('H', 1, 'ESP', 'CPV', '2026-06-15 16:00:00+00'::timestamptz, 'Mercedes-Benz Stadium, Atlanta'),    -- 12:00 PM ET
    ('G', 1, 'BEL', 'EGY', '2026-06-15 22:00:00+00'::timestamptz, 'Lumen Field, Seattle'),              -- 3:00 PM PT
    ('H', 1, 'KSA', 'URU', '2026-06-15 22:00:00+00'::timestamptz, 'Hard Rock Stadium, Miami Gardens'),  -- 6:00 PM ET
    ('G', 1, 'IRN', 'NZL', '2026-06-16 04:00:00+00'::timestamptz, 'SoFi Stadium, Inglewood'),           -- 9:00 PM PT
    -- June 16
    ('I', 1, 'FRA', 'SEN', '2026-06-16 19:00:00+00'::timestamptz, 'MetLife Stadium, East Rutherford'),  -- 3:00 PM ET
    ('I', 1, 'IRQ', 'NOR', '2026-06-16 22:00:00+00'::timestamptz, 'Gillette Stadium, Foxborough'),      -- 6:00 PM ET
    ('J', 1, 'ARG', 'ALG', '2026-06-17 01:00:00+00'::timestamptz, 'Arrowhead Stadium, Kansas City'),    -- 8:00 PM CT
    ('J', 1, 'AUT', 'JOR', '2026-06-17 04:00:00+00'::timestamptz, 'Levi''s Stadium, Santa Clara'),      -- 9:00 PM PT
    -- June 17
    ('K', 1, 'POR', 'COD', '2026-06-17 17:00:00+00'::timestamptz, 'NRG Stadium, Houston'),              -- 12:00 PM CT
    ('L', 1, 'ENG', 'CRO', '2026-06-17 20:00:00+00'::timestamptz, 'AT&T Stadium, Arlington'),           -- 3:00 PM CT
    ('L', 1, 'GHA', 'PAN', '2026-06-17 23:00:00+00'::timestamptz, 'BMO Field, Toronto'),                -- 7:00 PM ET
    ('K', 1, 'UZB', 'COL', '2026-06-18 02:00:00+00'::timestamptz, 'Estadio Azteca, Mexico City'),       -- 8:00 PM local

    -- ─── Matchday 2 (June 18–23) ────────────────────────────────────────────
    -- June 18
    ('A', 2, 'CZE', 'RSA', '2026-06-18 16:00:00+00'::timestamptz, 'Mercedes-Benz Stadium, Atlanta'),    -- 12:00 PM ET
    ('B', 2, 'SUI', 'BIH', '2026-06-18 19:00:00+00'::timestamptz, 'SoFi Stadium, Inglewood'),           -- 12:00 PM PT
    ('B', 2, 'CAN', 'QAT', '2026-06-18 22:00:00+00'::timestamptz, 'BC Place, Vancouver'),               -- 3:00 PM PT
    ('A', 2, 'MEX', 'KOR', '2026-06-19 03:00:00+00'::timestamptz, 'Estadio Akron, Zapopan'),            -- 9:00 PM local
    -- June 19
    ('D', 2, 'USA', 'AUS', '2026-06-19 19:00:00+00'::timestamptz, 'Lumen Field, Seattle'),              -- 12:00 PM PT
    ('C', 2, 'SCO', 'MAR', '2026-06-19 22:00:00+00'::timestamptz, 'Gillette Stadium, Foxborough'),      -- 6:00 PM ET
    ('C', 2, 'BRA', 'HAI', '2026-06-20 01:00:00+00'::timestamptz, 'Lincoln Financial Field, Philadelphia'), -- 9:00 PM ET
    ('D', 2, 'TUR', 'PAR', '2026-06-20 04:00:00+00'::timestamptz, 'Levi''s Stadium, Santa Clara'),      -- 9:00 PM PT
    -- June 20
    ('F', 2, 'NED', 'SWE', '2026-06-20 17:00:00+00'::timestamptz, 'NRG Stadium, Houston'),              -- 12:00 PM CT
    ('E', 2, 'GER', 'CIV', '2026-06-20 20:00:00+00'::timestamptz, 'BMO Field, Toronto'),                -- 4:00 PM ET
    ('E', 2, 'ECU', 'CUW', '2026-06-21 00:00:00+00'::timestamptz, 'Arrowhead Stadium, Kansas City'),    -- 7:00 PM CT
    ('F', 2, 'TUN', 'JPN', '2026-06-21 04:00:00+00'::timestamptz, 'Estadio Monterrey, Guadalupe'),      -- 10:00 PM local
    -- June 21
    ('H', 2, 'ESP', 'KSA', '2026-06-21 16:00:00+00'::timestamptz, 'Mercedes-Benz Stadium, Atlanta'),    -- 12:00 PM ET
    ('G', 2, 'BEL', 'IRN', '2026-06-21 19:00:00+00'::timestamptz, 'SoFi Stadium, Inglewood'),           -- 12:00 PM PT
    ('H', 2, 'URU', 'CPV', '2026-06-21 22:00:00+00'::timestamptz, 'Hard Rock Stadium, Miami Gardens'),  -- 6:00 PM ET
    ('G', 2, 'NZL', 'EGY', '2026-06-22 01:00:00+00'::timestamptz, 'BC Place, Vancouver'),               -- 6:00 PM PT
    -- June 22
    ('J', 2, 'ARG', 'AUT', '2026-06-22 17:00:00+00'::timestamptz, 'AT&T Stadium, Arlington'),           -- 12:00 PM CT
    ('I', 2, 'FRA', 'IRQ', '2026-06-22 21:00:00+00'::timestamptz, 'Lincoln Financial Field, Philadelphia'), -- 5:00 PM ET
    ('I', 2, 'NOR', 'SEN', '2026-06-23 00:00:00+00'::timestamptz, 'MetLife Stadium, East Rutherford'),  -- 8:00 PM ET
    ('J', 2, 'JOR', 'ALG', '2026-06-23 03:00:00+00'::timestamptz, 'Levi''s Stadium, Santa Clara'),      -- 8:00 PM PT
    -- June 23
    ('K', 2, 'POR', 'UZB', '2026-06-23 17:00:00+00'::timestamptz, 'NRG Stadium, Houston'),              -- 12:00 PM CT
    ('L', 2, 'ENG', 'GHA', '2026-06-23 20:00:00+00'::timestamptz, 'Gillette Stadium, Foxborough'),      -- 4:00 PM ET
    ('L', 2, 'PAN', 'CRO', '2026-06-23 23:00:00+00'::timestamptz, 'BMO Field, Toronto'),                -- 7:00 PM ET
    ('K', 2, 'COL', 'COD', '2026-06-24 02:00:00+00'::timestamptz, 'Estadio Akron, Zapopan'),            -- 8:00 PM local

    -- ─── Matchday 3 (June 24–27, simultaneous within group) ─────────────────
    -- June 24
    ('B', 3, 'SUI', 'CAN', '2026-06-24 19:00:00+00'::timestamptz, 'BC Place, Vancouver'),               -- 12:00 PM PT
    ('B', 3, 'BIH', 'QAT', '2026-06-24 19:00:00+00'::timestamptz, 'Lumen Field, Seattle'),              -- 12:00 PM PT
    ('C', 3, 'SCO', 'BRA', '2026-06-24 22:00:00+00'::timestamptz, 'Hard Rock Stadium, Miami Gardens'),  -- 6:00 PM ET
    ('C', 3, 'MAR', 'HAI', '2026-06-24 22:00:00+00'::timestamptz, 'Mercedes-Benz Stadium, Atlanta'),    -- 6:00 PM ET
    ('A', 3, 'CZE', 'MEX', '2026-06-25 01:00:00+00'::timestamptz, 'Estadio Azteca, Mexico City'),       -- 7:00 PM local
    ('A', 3, 'RSA', 'KOR', '2026-06-25 01:00:00+00'::timestamptz, 'Estadio Monterrey, Guadalupe'),      -- 7:00 PM local
    -- June 25
    ('E', 3, 'ECU', 'GER', '2026-06-25 20:00:00+00'::timestamptz, 'MetLife Stadium, East Rutherford'),  -- 4:00 PM ET
    ('E', 3, 'CUW', 'CIV', '2026-06-25 20:00:00+00'::timestamptz, 'Lincoln Financial Field, Philadelphia'), -- 4:00 PM ET
    ('F', 3, 'JPN', 'SWE', '2026-06-25 23:00:00+00'::timestamptz, 'AT&T Stadium, Arlington'),           -- 6:00 PM CT
    ('F', 3, 'TUN', 'NED', '2026-06-25 23:00:00+00'::timestamptz, 'Arrowhead Stadium, Kansas City'),    -- 6:00 PM CT
    ('D', 3, 'TUR', 'USA', '2026-06-26 02:00:00+00'::timestamptz, 'SoFi Stadium, Inglewood'),           -- 7:00 PM PT
    ('D', 3, 'PAR', 'AUS', '2026-06-26 02:00:00+00'::timestamptz, 'Levi''s Stadium, Santa Clara'),      -- 7:00 PM PT
    -- June 26
    ('I', 3, 'NOR', 'FRA', '2026-06-26 19:00:00+00'::timestamptz, 'Gillette Stadium, Foxborough'),      -- 3:00 PM ET
    ('I', 3, 'SEN', 'IRQ', '2026-06-26 19:00:00+00'::timestamptz, 'BMO Field, Toronto'),                -- 3:00 PM ET
    ('H', 3, 'CPV', 'KSA', '2026-06-27 00:00:00+00'::timestamptz, 'NRG Stadium, Houston'),              -- 7:00 PM CT
    ('H', 3, 'URU', 'ESP', '2026-06-27 00:00:00+00'::timestamptz, 'Estadio Akron, Zapopan'),            -- 6:00 PM local
    ('G', 3, 'EGY', 'IRN', '2026-06-27 03:00:00+00'::timestamptz, 'Lumen Field, Seattle'),              -- 8:00 PM PT
    ('G', 3, 'NZL', 'BEL', '2026-06-27 03:00:00+00'::timestamptz, 'BC Place, Vancouver'),               -- 8:00 PM PT
    -- June 27
    ('L', 3, 'PAN', 'ENG', '2026-06-27 21:00:00+00'::timestamptz, 'MetLife Stadium, East Rutherford'),  -- 5:00 PM ET
    ('L', 3, 'CRO', 'GHA', '2026-06-27 21:00:00+00'::timestamptz, 'Lincoln Financial Field, Philadelphia'), -- 5:00 PM ET
    ('K', 3, 'COL', 'POR', '2026-06-27 23:30:00+00'::timestamptz, 'Hard Rock Stadium, Miami Gardens'),  -- 7:30 PM ET
    ('K', 3, 'COD', 'UZB', '2026-06-27 23:30:00+00'::timestamptz, 'Mercedes-Benz Stadium, Atlanta'),    -- 7:30 PM ET
    ('J', 3, 'ALG', 'AUT', '2026-06-28 02:00:00+00'::timestamptz, 'Arrowhead Stadium, Kansas City'),    -- 9:00 PM CT
    ('J', 3, 'JOR', 'ARG', '2026-06-28 02:00:00+00'::timestamptz, 'AT&T Stadium, Arlington')            -- 9:00 PM CT
)
insert into matches (stage, group_code, matchday, team_a_id, team_b_id, kickoff_at, venue)
select 'group'::stage, s.group_code, s.matchday, ta.id, tb.id, s.kickoff_at, s.venue
from schedule s
join teams ta on ta.code = s.team_a_code
join teams tb on tb.code = s.team_b_code
order by s.kickoff_at, s.group_code;

-- Sanity check
do $$
declare n int;
begin
  select count(*) into n from matches where stage = 'group';
  if n <> 72 then raise exception 'expected 72 group matches, got %', n; end if;
end $$;

-- Group-stage lock = kickoff of the first match (Mexico v South Africa, June 11)
update tournament_settings
set
  group_stage_lock_at = (select min(kickoff_at) from matches where stage = 'group'),
  third_place_lock_at = (select min(kickoff_at) from matches where stage = 'group'),
  golden_boot_lock_at = (select min(kickoff_at) from matches where stage = 'group')
where id = 1;
