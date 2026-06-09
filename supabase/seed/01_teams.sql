-- 48 qualified teams for the 2026 FIFA World Cup.
-- Group draw held Dec 5, 2025, in Washington, D.C.
-- UEFA playoff winners (Bosnia, Sweden, Türkiye, Czechia) and inter-confederation
-- winners (DR Congo, Iraq) slotted into the placeholder draw positions.
-- Group/slot assignments verified against ESPN's published match schedule.

insert into teams (code, name, flag_code, group_code, slot, is_host) values
  -- Group A
  ('MEX', 'Mexico',         'mx', 'A', 1, true),
  ('KOR', 'South Korea',    'kr', 'A', 2, false),
  ('RSA', 'South Africa',   'za', 'A', 3, false),
  ('CZE', 'Czechia',        'cz', 'A', 4, false),       -- UEFA Playoff D winner

  -- Group B
  ('CAN', 'Canada',         'ca', 'B', 1, true),
  ('BIH', 'Bosnia & Herz.', 'ba', 'B', 2, false),       -- UEFA Playoff A winner
  ('QAT', 'Qatar',          'qa', 'B', 3, false),       -- TODO verify slot assignment
  ('SUI', 'Switzerland',    'ch', 'B', 4, false),

  -- Group C
  ('BRA', 'Brazil',         'br', 'C', 1, false),
  ('MAR', 'Morocco',        'ma', 'C', 2, false),
  ('HAI', 'Haiti',          'ht', 'C', 3, false),
  ('SCO', 'Scotland',       'gb-sct', 'C', 4, false),

  -- Group D
  ('USA', 'United States',  'us', 'D', 1, true),
  ('PAR', 'Paraguay',       'py', 'D', 2, false),
  ('AUS', 'Australia',      'au', 'D', 3, false),
  ('TUR', 'Türkiye',        'tr', 'D', 4, false),       -- UEFA Playoff C winner

  -- Group E
  ('GER', 'Germany',        'de', 'E', 1, false),
  ('CUW', 'Curaçao',        'cw', 'E', 2, false),
  ('CIV', 'Ivory Coast',    'ci', 'E', 3, false),
  ('ECU', 'Ecuador',        'ec', 'E', 4, false),

  -- Group F
  ('NED', 'Netherlands',    'nl', 'F', 1, false),
  ('JPN', 'Japan',          'jp', 'F', 2, false),
  ('SWE', 'Sweden',         'se', 'F', 3, false),       -- UEFA Playoff B winner
  ('TUN', 'Tunisia',        'tn', 'F', 4, false),

  -- Group G
  ('BEL', 'Belgium',        'be', 'G', 1, false),
  ('EGY', 'Egypt',          'eg', 'G', 2, false),
  ('IRN', 'Iran',           'ir', 'G', 3, false),
  ('NZL', 'New Zealand',    'nz', 'G', 4, false),

  -- Group H
  ('ESP', 'Spain',          'es', 'H', 1, false),
  ('CPV', 'Cape Verde',     'cv', 'H', 2, false),
  ('KSA', 'Saudi Arabia',   'sa', 'H', 3, false),
  ('URU', 'Uruguay',        'uy', 'H', 4, false),

  -- Group I
  ('FRA', 'France',         'fr', 'I', 1, false),
  ('SEN', 'Senegal',        'sn', 'I', 2, false),
  ('IRQ', 'Iraq',           'iq', 'I', 3, false),       -- Inter-conf playoff winner
  ('NOR', 'Norway',         'no', 'I', 4, false),

  -- Group J
  ('ARG', 'Argentina',      'ar', 'J', 1, false),
  ('AUT', 'Austria',        'at', 'J', 2, false),
  ('ALG', 'Algeria',        'dz', 'J', 3, false),
  ('JOR', 'Jordan',         'jo', 'J', 4, false),

  -- Group K
  ('POR', 'Portugal',       'pt', 'K', 1, false),
  ('COL', 'Colombia',       'co', 'K', 2, false),
  ('UZB', 'Uzbekistan',     'uz', 'K', 3, false),
  ('COD', 'DR Congo',       'cd', 'K', 4, false),       -- Inter-conf playoff winner

  -- Group L
  ('ENG', 'England',        'gb-eng', 'L', 1, false),
  ('CRO', 'Croatia',        'hr', 'L', 2, false),
  ('PAN', 'Panama',         'pa', 'L', 3, false),
  ('GHA', 'Ghana',          'gh', 'L', 4, false);

-- Initialize 3rd-place-results rows (filled after groups end)
insert into group_third_place_results (group_code, advanced)
select c, false from unnest(array['A','B','C','D','E','F','G','H','I','J','K','L']) c
on conflict do nothing;
