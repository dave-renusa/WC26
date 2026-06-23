export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "final";

export const STAGE_POINTS: Record<Stage, number> = {
  group: 1,
  r32: 1,
  r16: 3,
  qf: 5,
  sf: 8,
  final: 13,
};

export const THIRD_PLACE_POINTS = 3;
export const GOLDEN_BOOT_POINTS = 15;
// +5 each time a player correctly picks a 3rd-place group qualifier to win a
// knockout game. Awarded automatically from computed group standings.
export const THIRD_PLACE_WINNER_BONUS = 5;

export const STAGE_LABEL: Record<Stage, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
};

export interface Team {
  id: number;
  code: string;
  name: string;
  flag_code: string;
  group_code: string;
  slot: number;
  is_host: boolean;
  actual_finish: number | null;
  third_place_advanced: boolean | null;
}

export interface Match {
  id: number;
  stage: Stage;
  group_code: string | null;
  matchday: number | null;
  bracket_slot: number | null;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a_from_match_id: number | null;
  team_b_from_match_id: number | null;
  kickoff_at: string | null;
  venue: string | null;
  winner_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
}

export interface Pick {
  user_id: string;
  match_id: number;
  predicted_winner_team_id: number;
  predicted_score_a: number | null;
  predicted_score_b: number | null;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  total_points: number;
  match_points: number;
  third_place_points: number;
  bonus_points: number;
  predicted_final_total_goals: number | null;
  actual_final_total_goals: number | null;
  tiebreaker_distance: number | null;
}
