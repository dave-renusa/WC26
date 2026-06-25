// Standings-driven knockout fill.
//
// The ESPN matchup populate only fills an R32 slot once BOTH its teams are real
// (i.e. all groups are done). But a single group finishing already LOCKS that
// group's winner and runner-up into specific R32 slots — even while their
// opponents are still placeholders. This module computes the top two of every
// COMPLETED group and drops them into their slots, so the bracket fills in group
// by group, hands-free, instead of all at once at the very end.
//
// Correctness guard: we only write when the top-two order is unambiguous under
// FIFA tiebreakers (points → goal difference → goals for → head-to-head). If a
// group ends in a genuine dead heat that needs fair-play/drawing-of-lots, we
// skip it and let the end-of-groups ESPN matchup populate resolve it, rather
// than risk pinning the wrong team (writes are guarded `is null`, so a wrong
// pin would never be auto-corrected).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface GroupMatch {
  team_a_id: number | null;
  team_b_id: number | null;
  score_a: number | null;
  score_b: number | null;
}

interface Stat { id: number; pts: number; gf: number; ga: number; }

// FIFA R32 slot map (bracket_slot = official match number, side a/b per the
// matchup, see migration 007). 1st of each group on its winner side, 2nd on its
// runner-up side. 3rd-place slots are cross-group and stay for the ESPN populate.
export const FIRST_SLOT: Record<string, [number, "a" | "b"]> = {
  A: [79, "a"], B: [85, "a"], C: [76, "a"], D: [81, "a"], E: [74, "a"], F: [75, "a"],
  G: [82, "a"], H: [84, "a"], I: [77, "a"], J: [86, "a"], K: [87, "a"], L: [80, "a"],
};
export const SECOND_SLOT: Record<string, [number, "a" | "b"]> = {
  A: [73, "a"], B: [73, "b"], C: [75, "b"], D: [88, "a"], E: [78, "a"], F: [76, "b"],
  G: [88, "b"], H: [86, "b"], I: [78, "b"], J: [84, "b"], K: [83, "a"], L: [83, "b"],
};

function tally(ids: number[], ms: GroupMatch[]): Map<number, Stat> {
  const m = new Map<number, Stat>(ids.map((id) => [id, { id, pts: 0, gf: 0, ga: 0 }]));
  for (const g of ms) {
    if (g.team_a_id == null || g.team_b_id == null || g.score_a == null || g.score_b == null) continue;
    const A = m.get(g.team_a_id);
    const B = m.get(g.team_b_id);
    if (!A || !B) continue;
    A.gf += g.score_a; A.ga += g.score_b;
    B.gf += g.score_b; B.ga += g.score_a;
    if (g.score_a > g.score_b) A.pts += 3;
    else if (g.score_a < g.score_b) B.pts += 3;
    else { A.pts += 1; B.pts += 1; }
  }
  return m;
}

// Higher is better. Returns >0 if b outranks a (for descending sort).
function cmp(a: Stat, b: Stat): number {
  return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
}

// Rank a group with FIFA tiebreakers. top2Resolved is true only when 1st is
// strictly ahead of 2nd AND 2nd strictly ahead of 3rd (so the top two are
// unambiguous). Teams equal on points/GD/GF are re-ranked by head-to-head among
// just those teams; if still equal, the boundary is marked unresolved.
export function rankGroup(ids: number[], ms: GroupMatch[]): { order: number[]; top2Resolved: boolean } {
  const overall = tally(ids, ms);
  const sorted = [...ids].sort((x, y) => cmp(overall.get(x)!, overall.get(y)!));
  const key = (s: Stat) => `${s.pts}|${s.gf - s.ga}|${s.gf}`;

  const order: number[] = [];
  const strictBoundary: boolean[] = []; // [t] = is order[t] strictly ahead of order[t+1]

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && key(overall.get(sorted[j + 1])!) === key(overall.get(sorted[i])!)) j++;
    const run = sorted.slice(i, j + 1);

    if (run.length === 1) {
      if (order.length > 0) strictBoundary.push(true); // different overall key from prior
      order.push(run[0]);
    } else {
      // Head-to-head mini-table among only the tied teams.
      const h2h = tally(run, ms.filter((g) =>
        run.includes(g.team_a_id as number) && run.includes(g.team_b_id as number)));
      const sub = [...run].sort((x, y) => cmp(h2h.get(x)!, h2h.get(y)!));
      for (let k = 0; k < sub.length; k++) {
        if (order.length > 0) {
          strictBoundary.push(k === 0 ? true : cmp(h2h.get(sub[k - 1])!, h2h.get(sub[k])!) !== 0);
        }
        order.push(sub[k]);
      }
    }
    i = j + 1;
  }

  const top2Resolved =
    order.length >= 2 &&
    strictBoundary[0] === true &&
    (order.length < 3 || strictBoundary[1] === true);

  return { order, top2Resolved };
}

// For each fully-played group, pin its winner and runner-up into their R32 slots.
// `is null` guards make this idempotent and non-destructive: it never overwrites
// a slot already set (manual pin, admin override, or a prior run).
export async function fillFromCompletedGroups(
  supabase: SupabaseClient,
): Promise<{ filled: number; skippedGroups: string[] }> {
  const [{ data: teamRows }, { data: groupMatches }] = await Promise.all([
    supabase.from("teams").select("id, group_code"),
    supabase.from("matches").select("group_code, team_a_id, team_b_id, score_a, score_b").eq("stage", "group"),
  ]);

  const idsByGroup = new Map<string, number[]>();
  for (const t of (teamRows ?? []) as { id: number; group_code: string }[]) {
    (idsByGroup.get(t.group_code) ?? idsByGroup.set(t.group_code, []).get(t.group_code)!).push(t.id);
  }
  const msByGroup = new Map<string, GroupMatch[]>();
  for (const m of (groupMatches ?? []) as (GroupMatch & { group_code: string })[]) {
    (msByGroup.get(m.group_code) ?? msByGroup.set(m.group_code, []).get(m.group_code)!).push(m);
  }

  let filled = 0;
  const skippedGroups: string[] = [];

  for (const [grp, ids] of idsByGroup) {
    const ms = msByGroup.get(grp) ?? [];
    const fullSlate = ids.length * (ids.length - 1) / 2; // round-robin: 6 for a 4-team group
    const complete = ms.length >= fullSlate && ms.every((m) => m.score_a != null && m.score_b != null);
    if (!complete) continue;

    const { order, top2Resolved } = rankGroup(ids, ms);
    if (!top2Resolved) { skippedGroups.push(grp); continue; }

    const targets: Array<[[number, "a" | "b"], number]> = [
      [FIRST_SLOT[grp], order[0]],
      [SECOND_SLOT[grp], order[1]],
    ];
    for (const [[slot, side], teamId] of targets) {
      const col = side === "a" ? "team_a_id" : "team_b_id";
      const { error, count } = await supabase
        .from("matches")
        .update({ [col]: teamId }, { count: "exact" })
        .eq("bracket_slot", slot)
        .is(col, null);
      if (!error && count) filled += count;
    }
  }

  return { filled, skippedGroups };
}
