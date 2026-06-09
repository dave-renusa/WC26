-- Scoring views.
-- Per-round point values: Group=1, R32=2, R16=3, QF=5, SF=8, Final=13
-- Third-place pick correct = 3; Golden Boot correct = 15.

create or replace view v_stage_points as
select 'group'::stage as stage, 1 as points
union all select 'r32', 2
union all select 'r16', 3
union all select 'qf',  5
union all select 'sf',  8
union all select 'final', 13;

-- Points earned per pick. NULL points = match not yet decided.
create or replace view v_pick_scores as
select
  p.user_id,
  p.match_id,
  m.stage,
  case
    when m.winner_team_id is null then null
    when p.predicted_winner_team_id = m.winner_team_id then sp.points
    else 0
  end as points
from picks p
join matches m       on m.id = p.match_id
join v_stage_points sp on sp.stage = m.stage;

-- 3 pts per correct 3rd-place advancing group pick.
create or replace view v_third_place_scores as
select
  tp.user_id,
  case
    when r.advanced is null then null
    when r.advanced = true then 3
    else 0
  end as points
from third_place_picks tp
left join group_third_place_results r on r.group_code = tp.group_code;

-- 15 pts for correct Golden Boot. Case/whitespace-insensitive match.
create or replace view v_bonus_scores as
select
  bp.user_id,
  case
    when ts.golden_boot_winner is null or bp.golden_boot_player is null then null
    when lower(trim(bp.golden_boot_player)) = lower(trim(ts.golden_boot_winner)) then 15
    else 0
  end as golden_boot_points
from bonus_picks bp
cross join tournament_settings ts
where ts.id = 1;

-- Leaderboard: total points + tiebreaker info.
create or replace view v_leaderboard as
with pick_totals as (
  select user_id, sum(coalesce(points, 0)) as pts
  from v_pick_scores group by user_id
),
third_totals as (
  select user_id, sum(coalesce(points, 0)) as pts
  from v_third_place_scores group by user_id
),
bonus_totals as (
  select user_id, coalesce(golden_boot_points, 0) as pts
  from v_bonus_scores
),
final_match as (
  select score_a + score_b as actual_total_goals
  from matches
  where stage = 'final' and score_a is not null
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

-- Per-round breakdown per user (for the leaderboard expander)
create or replace view v_user_round_breakdown as
select
  user_id,
  stage,
  count(*) filter (where points is not null) as decided_picks,
  count(*) filter (where points > 0) as correct_picks,
  sum(coalesce(points, 0)) as points_earned
from v_pick_scores
group by user_id, stage;
