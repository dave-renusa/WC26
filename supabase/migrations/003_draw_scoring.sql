-- Drawn group-stage matches: 0.5 pts to anyone who picked either team.
-- A match is "drawn" when score_a is not null, score_b is not null, and
-- score_a = score_b. Knockouts can't draw (penalty shootouts produce a
-- winner_team_id), so this rule only fires in the group stage.

create or replace view v_pick_scores as
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
