-- WC26 schema
-- All times stored as UTC timestamptz.

-- ─────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────
create type stage as enum ('group', 'r32', 'r16', 'qf', 'sf', 'final');

-- ─────────────────────────────────────────────────────────
-- Profiles (1:1 with auth.users)
-- ─────────────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────
-- Teams (48)
-- ─────────────────────────────────────────────────────────
create table teams (
  id            serial primary key,
  code          text not null unique,                 -- 3-letter (USA, MEX...)
  name          text not null,
  flag_code     text not null,                        -- 2-letter ISO for flagcdn.com
  group_code    char(1) not null,                     -- A through L
  slot          int not null check (slot between 1 and 4),
  is_host       boolean not null default false,
  -- Filled by admin after groups end
  actual_finish int check (actual_finish between 1 and 4),
  third_place_advanced boolean,
  unique (group_code, slot)
);
create index teams_group_idx on teams (group_code, slot);

-- ─────────────────────────────────────────────────────────
-- Matches (72 group + 31 knockout = 103; opening + final = 104)
-- ─────────────────────────────────────────────────────────
create table matches (
  id                    serial primary key,
  stage                 stage not null,
  group_code            char(1),                                     -- groups only
  matchday              int check (matchday between 1 and 3),         -- groups only (MD1/2/3)
  bracket_slot          int,                                          -- knockouts only
  team_a_id             int references teams(id),
  team_b_id             int references teams(id),
  -- For knockouts where teams come from prior bracket slots
  team_a_from_match_id  int references matches(id),
  team_b_from_match_id  int references matches(id),
  kickoff_at            timestamptz,
  venue                 text,
  -- Filled by admin once played
  winner_team_id        int references teams(id),
  score_a               int,
  score_b               int,
  created_at            timestamptz not null default now()
);
create index matches_stage_idx on matches (stage);
create index matches_kickoff_idx on matches (kickoff_at);

-- ─────────────────────────────────────────────────────────
-- Picks: one per (user, match)
-- ─────────────────────────────────────────────────────────
create table picks (
  user_id                  uuid not null references profiles(id) on delete cascade,
  match_id                 int not null references matches(id) on delete cascade,
  predicted_winner_team_id int not null references teams(id),
  -- Only used on the final match for tiebreaker
  predicted_score_a        int,
  predicted_score_b        int,
  updated_at               timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index picks_match_idx on picks (match_id);

-- ─────────────────────────────────────────────────────────
-- Third-place picks (player picks 8 of 12 groups whose
-- 3rd-placer they think advances)
-- ─────────────────────────────────────────────────────────
create table third_place_picks (
  user_id     uuid not null references profiles(id) on delete cascade,
  group_code  char(1) not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, group_code)
);

-- One row per group, filled by admin after groups end
create table group_third_place_results (
  group_code  char(1) primary key,
  advanced    boolean not null default false
);

-- ─────────────────────────────────────────────────────────
-- Bonus picks (Golden Boot + tiebreaker)
-- ─────────────────────────────────────────────────────────
create table bonus_picks (
  user_id                       uuid primary key references profiles(id) on delete cascade,
  golden_boot_player            text,        -- free text; admin matches casing
  predicted_final_total_goals   int,         -- tiebreaker input
  updated_at                    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- Tournament settings (singleton)
-- ─────────────────────────────────────────────────────────
create table tournament_settings (
  id                          int primary key default 1 check (id = 1),
  group_stage_lock_at         timestamptz,
  third_place_lock_at         timestamptz,    -- usually same as group_stage_lock_at
  golden_boot_lock_at         timestamptz,    -- usually same as group_stage_lock_at
  r32_lock_at                 timestamptz,
  r16_lock_at                 timestamptz,
  qf_lock_at                  timestamptz,
  sf_lock_at                  timestamptz,
  final_lock_at               timestamptz,
  golden_boot_winner          text,
  is_finalized                boolean not null default false
);
insert into tournament_settings (id) values (1) on conflict do nothing;

-- ─────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────
alter table profiles                  enable row level security;
alter table teams                     enable row level security;
alter table matches                   enable row level security;
alter table picks                     enable row level security;
alter table third_place_picks         enable row level security;
alter table group_third_place_results enable row level security;
alter table bonus_picks               enable row level security;
alter table tournament_settings       enable row level security;

-- profiles: anyone authenticated can read; user can insert/update only their own row
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_insert_own on profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on profiles for update to authenticated using (auth.uid() = id);

-- reference data: public read; admin writes via service role (bypasses RLS)
create policy teams_select on teams for select using (true);
create policy matches_select on matches for select using (true);
create policy settings_select on tournament_settings for select using (true);
create policy third_place_results_select on group_third_place_results for select using (true);

-- picks: public read (leaderboard); each user writes their own
create policy picks_select on picks for select using (true);
create policy picks_insert_own on picks for insert to authenticated with check (auth.uid() = user_id);
create policy picks_update_own on picks for update to authenticated using (auth.uid() = user_id);

create policy third_place_picks_select on third_place_picks for select using (true);
create policy third_place_picks_insert_own on third_place_picks for insert to authenticated with check (auth.uid() = user_id);
create policy third_place_picks_update_own on third_place_picks for update to authenticated using (auth.uid() = user_id);
create policy third_place_picks_delete_own on third_place_picks for delete to authenticated using (auth.uid() = user_id);

create policy bonus_picks_select on bonus_picks for select using (true);
create policy bonus_picks_insert_own on bonus_picks for insert to authenticated with check (auth.uid() = user_id);
create policy bonus_picks_update_own on bonus_picks for update to authenticated using (auth.uid() = user_id);
