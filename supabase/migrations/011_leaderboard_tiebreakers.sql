-- Apply the published tiebreaker ladder to the leaderboard ordering, and expose
-- a computed finishing `position` (with proper shared ranks for true ties).
--
-- Published ladder (see rules page):
--   1. Closest to total goals in the Final   (tiebreaker_distance, dormant until
--      the Final is played — null for everyone before then)
--   2. Most correct picks                     (matches + 3rd-place calls, points > 0)
--   3. Round-by-round countback               (group, then R32, R16, QF, SF, Final)
--   4. Head-to-head on differing picks        (pairwise — NOT expressible as a single
--                                              SQL sort; stays the documented manual
--                                              step for the rare case rungs 1-3 tie)
--   5. Co-champions / split
--
-- position = RANK() over rungs 1-3, so two players who are equal on ALL of those
-- keys share the same position number (a genuine tie the UI marks with a "T");
-- everyone else gets a distinct position. RANK() yields 1, T2, T2, 4 — standard
-- competition ranking.
--
-- "Correct picks" counts any pick that earned points (points > 0), which matches
-- the per-round "X/Y correct" already shown in the leaderboard expander — this
-- includes the 0.5 credit for picking a team in a drawn group game, applied
-- equally to everyone.
--
-- Columns 1-9 are unchanged in name/order/type, and new columns are appended, so
-- CREATE OR REPLACE VIEW is valid. Nothing depends on v_leaderboard.

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
round_pts as (
  select
    user_id,
    coalesce(sum(points) filter (where stage = 'group'), 0) as group_pts,
    coalesce(sum(points) filter (where stage = 'r32'),   0) as r32_pts,
    coalesce(sum(points) filter (where stage = 'r16'),   0) as r16_pts,
    coalesce(sum(points) filter (where stage = 'qf'),    0) as qf_pts,
    coalesce(sum(points) filter (where stage = 'sf'),    0) as sf_pts,
    coalesce(sum(points) filter (where stage = 'final'), 0) as final_pts,
    count(*) filter (where points > 0) as match_correct
  from v_pick_scores
  group by user_id
),
third_correct as (
  select user_id, count(*) filter (where points > 0) as tp_correct
  from v_third_place_scores
  group by user_id
),
final_match as (
  select score_a + score_b as actual_total_goals
  from matches where stage = 'final' and score_a is not null
  order by id desc limit 1
),
base as (
  select
    p.id as user_id,
    p.display_name,
    coalesce(pt.pts, 0) + coalesce(tt.pts, 0) + coalesce(gb.pts, 0) + coalesce(tpw.pts, 0) as total_points,
    coalesce(pt.pts, 0) as match_points,
    coalesce(tt.pts, 0) as third_place_points,
    (coalesce(gb.pts, 0) + coalesce(tpw.pts, 0))::int as bonus_points,
    bp.predicted_final_total_goals,
    (select actual_total_goals from final_match) as actual_final_total_goals,
    case
      when (select actual_total_goals from final_match) is null then null
      else abs(bp.predicted_final_total_goals - (select actual_total_goals from final_match))
    end as tiebreaker_distance,
    (coalesce(rp.match_correct, 0) + coalesce(tc.tp_correct, 0))::int as correct_picks,
    coalesce(rp.group_pts, 0) as group_pts,
    coalesce(rp.r32_pts, 0)   as r32_pts,
    coalesce(rp.r16_pts, 0)   as r16_pts,
    coalesce(rp.qf_pts, 0)    as qf_pts,
    coalesce(rp.sf_pts, 0)    as sf_pts,
    coalesce(rp.final_pts, 0) as final_pts
  from profiles p
  left join pick_totals   pt  on pt.user_id  = p.id
  left join third_totals  tt  on tt.user_id  = p.id
  left join gb_totals     gb  on gb.user_id  = p.id
  left join tpw_totals    tpw on tpw.user_id = p.id
  left join round_pts     rp  on rp.user_id  = p.id
  left join third_correct tc  on tc.user_id  = p.id
  left join bonus_picks   bp  on bp.user_id  = p.id
)
select
  base.*,
  rank() over (
    order by
      total_points desc,
      tiebreaker_distance asc nulls last,
      correct_picks desc,
      group_pts desc,
      r32_pts desc,
      r16_pts desc,
      qf_pts desc,
      sf_pts desc,
      final_pts desc
  )::int as position
from base
order by position;
