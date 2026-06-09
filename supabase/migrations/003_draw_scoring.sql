-- Drawn group-stage matches: 0.5 pts to anyone who picked either team.
-- A match is "drawn" when score_a is not null, score_b is not null, and
-- score_a = score_b. Knockouts can't draw (penalty shootouts produce a
-- winner_team_id), so this rule only fires in the group stage.
--
-- v_pick_scores.points changes from integer to numeric (to hold 0.5).
-- Postgres can't change a view column's type with CREATE OR REPLACE, so we
-- drop with cascade and rebuild the two dependent views too.

drop view if exists v_pick_scores cascade;

create view v_pick_scores as
select
  p.user_id,
  p.match_id,
  m.stage,
  case
    when m.score_a is null or m.score_b is null then null            -- not played yet
    when m.score_a = m.score_b then                                  -- drawn match
      case
        when p.predicted_winner_team_id in (m.team_a_id, m.team_b_id) then 0.5
        else 0
      end
    when p.predicted_winner_team_id = m.winner_team_id then sp.points -- correct winner
    else 0                                                            -- wrong winner
  end as points
from picks p
join matches m       on m.id = p.match_id
join v_stage_points sp on sp.stage = m.stage;

create view v_user_round_breakdown as
select
  user_id,
  stage,
  count(*) filter (where points is not null) as decided_picks,
  count(*) filter (where points > 0) as correct_picks,
  sum(coalesce(points, 0)) as points_earned
from v_pick_scores
group by user_id, stage;

create view v_leaderboard as
with pick_totals as (
  select user_id, sum(coalesce(points, 0)) as pts from v_pick_scores group by user_id
),
third_totals as (
  select user_id, sum(coalesce(points, 0)) as pts from v_third_place_scores group by user_id
),
bonus_totals as (
  select user_id, coalesce(golden_boot_points, 0) as pts from v_bonus_scores
),
final_match as (
  select score_a + score_b as actual_total_goals
  from matches where stage = 'final' and score_a is not null
  order by id desc limit 1
)
select
  p.id as user_id,
  p.display_name,
  coalesce(pt.pts, 0) + coalesce(tt.pts, 0) + coalesce(bt.pts, 0) as total_points,
  coalesce(pt.pts, 0) as match_points,
  coalesce(tt.pts, 0) as third_place_points,
  coalesce(bt.pts, 0) as bonus_points,
  bp.predicted_final_total_goals,
  (select actual_total_goals from final_match) as actual_final_total_goals,
  case
    when (select actual_total_goals from final_match) is null then null
    else abs(bp.predicted_final_total_goals - (select actual_total_goals from final_match))
  end as tiebreaker_distance
from profiles p
left join pick_totals  pt on pt.user_id = p.id
left join third_totals tt on tt.user_id = p.id
left join bonus_totals bt on bt.user_id = p.id
left join bonus_picks  bp on bp.user_id = p.id
order by total_points desc nulls last, tiebreaker_distance asc nulls last;
