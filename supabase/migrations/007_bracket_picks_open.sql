-- Whether the knockout bracket is clickable (picks open) yet.
-- The bracket page is always visible, but cards are read-only until an admin
-- flips this on. The first-R32-kickoff lock still freezes picks at kickoff.
alter table tournament_settings
  add column if not exists bracket_picks_open boolean not null default false;
