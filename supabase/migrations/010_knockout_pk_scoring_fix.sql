-- Fix: knockout games decided on penalties were mis-scored as draws.
--
-- Symptom: a knockout match that went to a penalty shootout (e.g. Paraguay
-- beat Germany after a 1-1 draw) awarded 0.5 pts to EVERYONE who picked either
-- team, instead of the full round points to whoever picked the actual winner.
-- There are no ties in the knockout stage — the shootout produces a winner.
--
-- Root cause: v_pick_scores (from 003_draw_scoring.sql) tested
-- `score_a = score_b` BEFORE testing the winner. ESPN's score for a knockout
-- game is regulation + extra time only, so a shootout result arrives as a draw
-- on the scoreline (1-1) even though winner_team_id is correctly set to the
-- shootout winner. The 0.5 "drawn match" branch therefore fired on every
-- penalty-shootout knockout. The old comment claimed the rule "only fires in
-- the group stage" but nothing enforced that — this migration makes it true.
--
-- Fix: the 0.5 half-point rule is GROUP-STAGE ONLY. Guarding it on
-- `m.stage = 'group'` makes knockout games fall through to the winner check,
-- which awards the round's full points to whoever picked the (PK) winner and 0
-- to everyone else.
--
-- Column list/order/types are unchanged (points stays numeric), so
-- CREATE OR REPLACE is valid and the dependent views
-- (v_user_round_breakdown, v_leaderboard) keep working untouched.

create or replace view v_pick_scores as
select
  p.user_id,
  p.match_id,
  m.stage,
  case
    when m.score_a is null or m.score_b is null then null              -- not played yet
    when m.stage = 'group' and m.score_a = m.score_b then              -- GROUP draw only
      case
        when p.predicted_winner_team_id in (m.team_a_id, m.team_b_id) then 0.5
        else 0
      end
    when p.predicted_winner_team_id = m.winner_team_id then sp.points  -- correct winner (incl. shootout winner)
    else 0                                                             -- wrong winner
  end as points
from picks p
join matches m        on m.id = p.match_id
join v_stage_points sp on sp.stage = m.stage;
