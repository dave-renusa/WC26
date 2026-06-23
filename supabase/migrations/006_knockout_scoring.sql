-- Knockout scoring rework + automatic third-place-winner bonus.
--
-- Changes:
--   * Round of 32 winner pick: 2 pts -> 1 pt. R16/QF/SF/Final unchanged
--     (3 / 5 / 8 / 13).
--   * New +5 bonus for every knockout game where the player correctly picked a
--     team that qualified out of its group in 3RD PLACE to win. Stacks across
--     all knockout rounds (R32, R16, ...). The "3rd place" status is derived
--     automatically from group results (no manual admin step) — see
--     v_group_standings.
--   * The bonus is folded into the leaderboard's existing bonus_points bucket
--     (next to the Golden Boot) and into total_points.
--
-- The total-goals-in-the-Final tiebreaker is unchanged.

-- ── New point scale: R32 drops 2 -> 1 ──────────────────────────────────────
create or replace view v_stage_points as
select 'group'::stage as stage, 1 as points
union all select 'r32', 1
union all select 'r16', 3
union all select 'qf',  5
union all select 'sf',  8
union all select 'final', 13;

-- ── Group standings, computed from played group matches ────────────────────
-- Win = 3, Draw = 1, Loss = 0. Ranked within each group by points, then goal
-- difference, then goals for (FIFA's primary tiebreakers). team_id ensures a
-- deterministic order on exact ties so exactly one team gets each finish 1..4.
-- An admin can override a specific team via teams.actual_finish if an official
-- head-to-head / fair-play tiebreaker ever disagrees with this ordering.
create or replace view v_group_standings as
with team_matches as (
  select m.team_a_id as team_id, m.group_code, m.score_a as gf, m.score_b as ga
  from matches m
  where m.stage = 'group' and m.score_a is not null and m.score_b is not null
  union all
  select m.team_b_id as team_id, m.group_code, m.score_b as gf, m.score_a as ga
  from matches m
  where m.stage = 'group' and m.score_a is not null and m.score_b is not null
),
agg as (
  select
    t.id          as team_id,
    t.group_code,
    count(tm.team_id) as played,
    coalesce(sum(case when tm.gf > tm.ga then 3 when tm.gf = tm.ga then 1 else 0 end), 0) as points,
    coalesce(sum(tm.gf), 0)            as gf,
    coalesce(sum(tm.ga), 0)            as ga,
    coalesce(sum(tm.gf - tm.ga), 0)    as gd
  from teams t
  left join team_matches tm on tm.team_id = t.id
  group by t.id, t.group_code
)
select
  team_id,
  group_code,
  played,
  points,
  gf,
  ga,
  gd,
  row_number() over (
    partition by group_code
    order by points desc, gd desc, gf desc, team_id
  ) as group_finish
from agg;

-- ── +5 per knockout game where a picked 3rd-place team actually won ─────────
-- "3rd place" = computed group_finish of 3, unless the admin pinned a different
-- teams.actual_finish. A 3rd-place team is only ever in a knockout match if it
-- advanced, so winning one implies it qualified.
create or replace view v_third_place_winner_bonuses as
select
  p.user_id,
  count(*) * 5 as points
from picks p
join matches m            on m.id = p.match_id
join teams   t            on t.id = p.predicted_winner_team_id
left join v_group_standings gs on gs.team_id = t.id
where m.stage <> 'group'
  and m.winner_team_id is not null
  and p.predicted_winner_team_id = m.winner_team_id
  and coalesce(t.actual_finish, gs.group_finish) = 3
group by p.user_id;

-- ── Leaderboard: fold the bonus into bonus_points + total_points ───────────
-- Column list/order/types are unchanged, so CREATE OR REPLACE is valid.
create or replace view v_leaderboard as
with pick_totals as (
  select user_id, sum(coalesce(points, 0)) as pts from v_pick_scores group by user_id
),
third_totals as (
  select user_id, sum(coalesce(points, 0)) as pts from v_third_place_scores group by user_id
),
gb_totals as (
  select user_id, coalesce(golden_boot_points, 0) as pts from v_bonus_scores
),
tpw_totals as (
  select user_id, points as pts from v_third_place_winner_bonuses
),
final_match as (
  select score_a + score_b as actual_total_goals
  from matches where stage = 'final' and score_a is not null
  order by id desc limit 1
)
select
  p.id as user_id,
  p.display_name,
  coalesce(pt.pts, 0) + coalesce(tt.pts, 0) + coalesce(gb.pts, 0) + coalesce(tpw.pts, 0) as total_points,
  coalesce(pt.pts, 0) as match_points,
  coalesce(tt.pts, 0) as third_place_points,
  -- Cast back to integer: count(*) makes the bonus bigint, but the existing
  -- view column is integer and CREATE OR REPLACE can't change a column's type.
  (coalesce(gb.pts, 0) + coalesce(tpw.pts, 0))::int as bonus_points,
  bp.predicted_final_total_goals,
  (select actual_total_goals from final_match) as actual_final_total_goals,
  case
    when (select actual_total_goals from final_match) is null then null
    else abs(bp.predicted_final_total_goals - (select actual_total_goals from final_match))
  end as tiebreaker_distance
from profiles p
left join pick_totals  pt  on pt.user_id  = p.id
left join third_totals tt  on tt.user_id  = p.id
left join gb_totals    gb  on gb.user_id  = p.id
left join tpw_totals   tpw on tpw.user_id = p.id
left join bonus_picks  bp  on bp.user_id  = p.id
order by total_points desc nulls last, tiebreaker_distance asc nulls last;
