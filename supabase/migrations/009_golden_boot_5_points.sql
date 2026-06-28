-- Golden Boot bonus: 15 pts -> 5 pts.
--
-- The Golden Boot value is hardcoded in v_bonus_scores (originally 002_views.sql).
-- v_leaderboard reads golden_boot_points from this view, so recreating the view
-- with the new value updates the leaderboard automatically. Column
-- list/order/types are unchanged, so CREATE OR REPLACE is valid.

create or replace view v_bonus_scores as
select
  bp.user_id,
  case
    when ts.golden_boot_winner is null or bp.golden_boot_player is null then null
    when lower(trim(bp.golden_boot_player)) = lower(trim(ts.golden_boot_winner)) then 5
    else 0
  end as golden_boot_points
from bonus_picks bp
cross join tournament_settings ts
where ts.id = 1;
