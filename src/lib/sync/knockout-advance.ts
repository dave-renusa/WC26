// Winner propagation down the knockout bracket.
//
// Knockout team slots were historically filled ONLY by date-matching ESPN events
// into empty rows (see resolve.ts phase 2). That has a sharp edge: the real-world
// schedule includes a third-place playoff (the two losing semifinalists) the day
// before the Final. Our bracket has no row for that game, so when it appeared it
// got slotted into the only empty knockout row left — the Final — writing the
// semifinal LOSERS into it. See the Spain/Argentina-vs-France/England incident.
//
// The fix: make our own recorded results the source of truth for who advances.
// Every knockout row stores team_a_from_match_id / team_b_from_match_id (the two
// feeding matches). Once both feeders have a winner, the row's teams ARE those
// winners — no date-matching required, and no empty slot for a stray event to
// grab. This also self-heals a slot that was previously mis-populated.
//
// Correctness guards:
//   - Only touch a match that has NOT been played yet (winner_team_id is null).
//     A decided match's teams are already correct and its score is attributed to
//     them; never rewrite those.
//   - Only fill when BOTH feeders are decided, and assign winner(team_a_from) to
//     team_a_id and winner(team_b_from) to team_b_id (bracket order preserved).
//   - Write only when something actually changes (idempotent).

import type { SupabaseClient } from "@supabase/supabase-js";

interface KnockoutRow {
  id: number;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a_from_match_id: number | null;
  team_b_from_match_id: number | null;
  winner_team_id: number | null;
}

export async function fillKnockoutFromWinners(
  supabase: SupabaseClient,
): Promise<{ advanced: number; corrected: number }> {
  const { data } = await supabase
    .from("matches")
    .select(
      "id, team_a_id, team_b_id, team_a_from_match_id, team_b_from_match_id, winner_team_id",
    )
    .neq("stage", "group");

  const rows = (data ?? []) as KnockoutRow[];
  const winnerOf = new Map<number, number | null>(
    rows.map((r) => [r.id, r.winner_team_id]),
  );

  let advanced = 0; // empty slot filled for the first time
  let corrected = 0; // wrong slot overwritten (e.g. a hijacked Final)

  for (const m of rows) {
    // Never rewrite a match that has already been played.
    if (m.winner_team_id != null) continue;
    if (m.team_a_from_match_id == null || m.team_b_from_match_id == null) continue;

    const desiredA = winnerOf.get(m.team_a_from_match_id) ?? null;
    const desiredB = winnerOf.get(m.team_b_from_match_id) ?? null;
    if (desiredA == null || desiredB == null) continue; // wait for both feeders

    if (m.team_a_id === desiredA && m.team_b_id === desiredB) continue; // already right

    const { error } = await supabase
      .from("matches")
      .update({ team_a_id: desiredA, team_b_id: desiredB })
      .eq("id", m.id);
    if (error) continue;

    if (m.team_a_id == null && m.team_b_id == null) advanced += 1;
    else corrected += 1;
  }

  return { advanced, corrected };
}
