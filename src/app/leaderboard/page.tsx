import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABEL, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LeaderRow {
  user_id: string;
  display_name: string;
  total_points: number;
  match_points: number;
  third_place_points: number;
  bonus_points: number;
  predicted_final_total_goals: number | null;
  actual_final_total_goals: number | null;
  tiebreaker_distance: number | null;
  // Added by migration 011 (v_leaderboard). Optional so the page keeps working
  // in the window between deploy and the manual Supabase migration.
  position?: number | null;
}

// Finishing rank per row, with `tied` set when the position is genuinely shared
// (equal on every applicable tiebreaker). Uses the view's `position` (the full
// ladder) when present; before migration 011 is applied it falls back to
// points-only competition ranking so nothing breaks.
function computeRanks(
  rows: LeaderRow[],
): { rank: number; tied: boolean }[] {
  const hasLadder = rows.some((r) => r.position != null);
  if (hasLadder) {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.position!, (counts.get(r.position!) ?? 0) + 1);
    return rows.map((r) => ({ rank: r.position!, tied: (counts.get(r.position!) ?? 1) > 1 }));
  }
  let lastPts: number | null = null;
  let lastRank = 0;
  const raw = rows.map((r, idx) => {
    const rank = lastPts !== null && r.total_points === lastPts ? lastRank : idx + 1;
    lastPts = r.total_points;
    lastRank = rank;
    return rank;
  });
  const counts = new Map<number, number>();
  for (const rk of raw) counts.set(rk, (counts.get(rk) ?? 0) + 1);
  return raw.map((rk) => ({ rank: rk, tied: (counts.get(rk) ?? 1) > 1 }));
}

function rankColorClass(rank: number): string {
  return rank === 1
    ? "text-gold"
    : rank === 2
      ? "text-emerald-900"
      : rank === 3
        ? "text-amber-800"
        : "text-emerald-900/40";
}

interface RoundRow {
  user_id: string;
  stage: Stage;
  decided_picks: number;
  correct_picks: number;
  points_earned: number;
}

// One row per third-place group pick: points is null (undecided), 0 (group's
// 3rd-placer didn't advance) or 3 (advanced — correct).
interface ThirdPlaceScore {
  user_id: string;
  points: number | null;
}

// Per-user total of the +5 "your picked 3rd-place team won a knockout game"
// bonuses. points is always a multiple of 5.
interface ThirdPlaceWinnerBonus {
  user_id: string;
  points: number;
}

const STAGE_ORDER: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];
const KNOCKOUT_STAGES: Stage[] = ["r32", "r16", "qf", "sf", "final"];

// Points a correct winner pick is worth per stage (matches v_stage_points).
const STAGE_POINTS: Record<Stage, number> = {
  group: 1,
  r32: 1,
  r16: 3,
  qf: 5,
  sf: 8,
  final: 13,
};

// The Golden Boot pick is stored as free text (a player's name), so there's no
// team link in the DB. This maps every player currently picked to their nation
// so the Golden Boot ceiling (5 pts, see migration 009) drops off once that
// nation is eliminated — i.e. we only count it for players whose country is
// still alive. Picks lock at group-stage kickoff, so this list is complete.
const GOLDEN_BOOT_COUNTRY: Record<string, string> = {
  "Kylian Mbappé": "France",
  "Ousmane Dembélé": "France",
  "Michael Olise": "France",
  "Harry Kane": "England",
  "Lionel Messi": "Argentina",
  "Lamine Yamal": "Spain",
  "Erling Haaland": "Norway",
  "Vinícius Júnior": "Brazil",
};

interface MatchLite {
  id: number;
  stage: Stage;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a_from_match_id: number | null;
  team_b_from_match_id: number | null;
  winner_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
}

interface PickLite {
  user_id: string;
  match_id: number;
  predicted_winner_team_id: number | null;
}

// Maximum points still on the table for each user, assuming every remaining
// pick hits. "Remaining" = picks on matches not yet decided whose predicted
// team is still able to win, plus the Golden Boot (only if the picked player's
// nation is still alive), plus any undecided 3rd-place group calls.
function computeMaxByUser(opts: {
  leaderboard: LeaderRow[];
  matches: MatchLite[];
  undecidedPicks: PickLite[];
  goldenBoot: Map<string, string | null>;
  goldenBootDecided: boolean;
  aliveTeamIds: Set<number>;
  aliveCountries: Set<string>;
  thirdPlaceTeamIds: Set<number>;
  tpUndecidedByUser: Map<string, number>;
}): Map<string, number> {
  const mById = new Map(opts.matches.map((m) => [m.id, m]));

  // A future-round knockout row may not have its teams populated yet (sync lag
  // or the feeding round just finished). Resolve the effective participants by
  // following the bracket tree to the source matches' winners when possible.
  const winnerOfSrc = (src: number | null): number | null =>
    src == null ? null : mById.get(src)?.winner_team_id ?? null;
  const effectiveTeams = (m: MatchLite): [number | null, number | null] => [
    m.team_a_id ?? winnerOfSrc(m.team_a_from_match_id),
    m.team_b_id ?? winnerOfSrc(m.team_b_from_match_id),
  ];

  const picksByUser = new Map<string, PickLite[]>();
  for (const p of opts.undecidedPicks) {
    const arr = picksByUser.get(p.user_id) ?? [];
    arr.push(p);
    picksByUser.set(p.user_id, arr);
  }

  const out = new Map<string, number>();
  for (const u of opts.leaderboard) {
    let remaining = 0;
    for (const p of picksByUser.get(u.user_id) ?? []) {
      const m = mById.get(p.match_id);
      const team = p.predicted_winner_team_id;
      if (!m || team == null) continue;

      let winnable: boolean;
      if (m.stage === "group") {
        winnable = true; // group teams are fixed, so the pick can always land
      } else {
        const [a, b] = effectiveTeams(m);
        winnable =
          a != null && b != null
            ? team === a || team === b // teams known → must be one of them
            : opts.aliveTeamIds.has(team); // teams unknown → any still-alive team
      }
      if (!winnable) continue;

      remaining += STAGE_POINTS[m.stage];
      // +5 if a picked 3rd-place group qualifier wins a knockout game.
      if (m.stage !== "group" && opts.thirdPlaceTeamIds.has(team)) remaining += 5;
    }

    const gb = opts.goldenBoot.get(u.user_id);
    if (
      !opts.goldenBootDecided &&
      gb &&
      opts.aliveCountries.has(GOLDEN_BOOT_COUNTRY[gb.trim()] ?? "")
    ) {
      remaining += 5;
    }

    remaining += (opts.tpUndecidedByUser.get(u.user_id) ?? 0) * 3;

    out.set(u.user_id, u.total_points + remaining);
  }
  return out;
}

function fmtPoints(n: number | null | undefined): string {
  if (n == null) return "0";
  // Half-points are real (drawn group games), so keep one decimal when needed.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function groupPointsOf(rounds: Map<Stage, RoundRow> | undefined): number {
  return rounds?.get("group")?.points_earned ?? 0;
}

function bracketPointsOf(rounds: Map<Stage, RoundRow> | undefined): number {
  if (!rounds) return 0;
  return KNOCKOUT_STAGES.reduce((sum, st) => sum + (rounds.get(st)?.points_earned ?? 0), 0);
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const [
    { data: rows },
    { data: rounds },
    { data: tpScores },
    { data: tpwBonuses },
    { data: settings },
    { data: matchRows },
    { data: bonusRows },
    { data: teamRows },
    { data: standingRows },
  ] = await Promise.all([
    supabase.from("v_leaderboard").select("*"),
    supabase.from("v_user_round_breakdown").select("*"),
    supabase.from("v_third_place_scores").select("*"),
    supabase.from("v_third_place_winner_bonuses").select("*"),
    supabase
      .from("tournament_settings")
      .select("group_stage_lock_at, golden_boot_winner")
      .eq("id", 1)
      .single(),
    supabase
      .from("matches")
      .select(
        "id, stage, team_a_id, team_b_id, team_a_from_match_id, team_b_from_match_id, winner_team_id, score_a, score_b",
      ),
    supabase.from("bonus_picks").select("user_id, golden_boot_player"),
    supabase.from("teams").select("id, name, actual_finish"),
    supabase.from("v_group_standings").select("team_id, group_finish"),
  ]);

  const leaderboard = (rows ?? []) as LeaderRow[];
  const breakdown = (rounds ?? []) as RoundRow[];

  const byUser = new Map<string, Map<Stage, RoundRow>>();
  for (const r of breakdown) {
    let m = byUser.get(r.user_id);
    if (!m) {
      m = new Map();
      byUser.set(r.user_id, m);
    }
    m.set(r.stage, r);
  }

  // Group 3rd-place pick performance per user: how many of their "which groups'
  // 3rd-placer advances" calls were right, out of the ones now decided.
  const tp3ByUser = new Map<string, { decided: number; correct: number; points: number }>();
  for (const r of (tpScores ?? []) as ThirdPlaceScore[]) {
    const cur = tp3ByUser.get(r.user_id) ?? { decided: 0, correct: 0, points: 0 };
    if (r.points != null) {
      cur.decided += 1;
      cur.points += r.points;
      if (r.points > 0) cur.correct += 1;
    }
    tp3ByUser.set(r.user_id, cur);
  }

  // Knockout 3rd-place bonus per user: points / 5 = number of knockout matches
  // a picked 3rd-place qualifier actually won.
  const tpwByUser = new Map<string, number>();
  for (const r of (tpwBonuses ?? []) as ThirdPlaceWinnerBonus[]) {
    tpwByUser.set(r.user_id, r.points);
  }

  // ── Maximum-possible points (ceiling if every remaining pick is correct) ──
  const matches = (matchRows ?? []) as MatchLite[];
  const teams = (teamRows ?? []) as {
    id: number;
    name: string;
    actual_finish: number | null;
  }[];
  const standings = (standingRows ?? []) as {
    team_id: number;
    group_finish: number;
  }[];

  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  // Alive = a knockout participant that has never lost a knockout match. A team
  // knocked out in the group stage never enters this set.
  const koParticipants = new Set<number>();
  const eliminated = new Set<number>();
  for (const m of matches) {
    if (m.stage === "group") continue;
    for (const t of [m.team_a_id, m.team_b_id]) if (t != null) koParticipants.add(t);
    if (m.winner_team_id != null) {
      for (const t of [m.team_a_id, m.team_b_id])
        if (t != null && t !== m.winner_team_id) eliminated.add(t);
    }
  }
  const aliveTeamIds = new Set(
    [...koParticipants].filter((t) => !eliminated.has(t)),
  );
  const aliveCountries = new Set(
    [...aliveTeamIds].map((t) => teamName.get(t)).filter((n): n is string => !!n),
  );

  // Teams that qualified out of their group in 3rd place (admin override wins).
  const finishOf = new Map<number, number>();
  for (const s of standings) finishOf.set(s.team_id, s.group_finish);
  for (const t of teams) if (t.actual_finish != null) finishOf.set(t.id, t.actual_finish);
  const thirdPlaceTeamIds = new Set(
    [...finishOf.entries()].filter(([, f]) => f === 3).map(([id]) => id),
  );

  const goldenBoot = new Map<string, string | null>(
    ((bonusRows ?? []) as { user_id: string; golden_boot_player: string | null }[]).map(
      (b) => [b.user_id, b.golden_boot_player],
    ),
  );
  const goldenBootDecided = settings?.golden_boot_winner != null;

  // Undecided 3rd-place group calls (3 pts each) — points is null until the
  // group's 3rd-placer's fate is known.
  const tpUndecidedByUser = new Map<string, number>();
  for (const r of (tpScores ?? []) as ThirdPlaceScore[]) {
    if (r.points == null)
      tpUndecidedByUser.set(r.user_id, (tpUndecidedByUser.get(r.user_id) ?? 0) + 1);
  }

  // Only fetch picks on not-yet-decided matches — keeps the row count tiny (well
  // under Supabase's 1000-row default) and those are the only picks that can
  // still add points.
  const undecidedMatchIds = matches
    .filter((m) =>
      m.stage === "group"
        ? m.score_a == null || m.score_b == null
        : m.winner_team_id == null,
    )
    .map((m) => m.id);
  const { data: undecidedPickRows } = undecidedMatchIds.length
    ? await supabase
        .from("picks")
        .select("user_id, match_id, predicted_winner_team_id")
        .in("match_id", undecidedMatchIds)
    : { data: [] as PickLite[] };

  const maxByUser = computeMaxByUser({
    leaderboard,
    matches,
    undecidedPicks: (undecidedPickRows ?? []) as PickLite[],
    goldenBoot,
    goldenBootDecided,
    aliveTeamIds,
    aliveCountries,
    thirdPlaceTeamIds,
    tpUndecidedByUser,
  });

  const lockAt = settings?.group_stage_lock_at as string | null | undefined;
  const tournamentStarted = lockAt ? Date.parse(lockAt) <= Date.now() : false;

  // Order by the tiebreaker ladder (view already sorts by `position`, but sort
  // client-side too so it's stable regardless), then compute display ranks.
  const ordered = leaderboard.some((r) => r.position != null)
    ? [...leaderboard].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : leaderboard;
  const ranks = computeRanks(ordered);

  // Only advertise tiebreakers once the ladder is actually live (migration 011
  // applied). Wording shifts once the Final is played and rung 1 turns on.
  const ladderActive = leaderboard.some((r) => r.position != null);
  const finalPlayed = leaderboard.some((r) => r.actual_final_total_goals != null);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-emerald-950">Leaderboard</h1>
          <p className="mt-1 text-sm text-emerald-950/60">
            {tournamentStarted
              ? "Updated as matches finalize."
              : "Standings populate as group-stage matches finish."}
          </p>
        </div>
        <div className="text-xs text-emerald-900/50 font-semibold uppercase tracking-widest">
          {leaderboard.length} {leaderboard.length === 1 ? "player" : "players"}
        </div>
      </div>

      {ladderActive && leaderboard.length > 0 && (
        <div className="mt-6 card-pitch rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-emerald-950/80 leading-relaxed">
          <span aria-hidden className="text-base leading-none mt-0.5">
            ⚖️
          </span>
          <p>
            <strong className="text-emerald-950">Tiebreakers are in effect.</strong>{" "}
            {finalPlayed ? (
              <>
                Players level on points are ranked by the closest guess to the
                Final&apos;s total goals, then most correct picks, then
                round-by-round scoring.
              </>
            ) : (
              <>
                Total goals in the Final is still tiebreaker #1 — it just
                can&apos;t be scored until the Final is played. So this is the
                current standing, with players level on points separated by the
                next tiebreakers: most correct picks, then round-by-round
                scoring. Those tied spots can still shift once the Final lands.
              </>
            )}{" "}
            A shared <strong className="text-emerald-950">T</strong> (like T2)
            marks a genuine tie.{" "}
            <Link
              href="/rules"
              className="font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2"
            >
              Full order
            </Link>
          </p>
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="mt-8 card rounded-2xl p-8 text-emerald-950/60">
          No players have signed up yet.
        </div>
      ) : (
        <div className="mt-8 card rounded-2xl overflow-hidden">
          {/* Column header — desktop table only; the mobile cards are self-labeled. */}
          <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(6,5rem)] items-end gap-x-4 px-5 py-3 text-[10px] uppercase tracking-wide font-bold text-emerald-900/50 border-b border-emerald-900/10">
            <span className="w-7">#</span>
            <span>Player</span>
            <span className="text-right">Group</span>
            <span className="text-right">3rd Place</span>
            <span className="text-right">Knockout</span>
            <span className="text-right">Upset &amp; GB Bonus</span>
            <span className="text-right">Total</span>
            <span
              className="text-right text-emerald-700/70"
              title="Ceiling if every remaining pick is correct — counts only still-alive teams, and the Golden Boot only if the picked player's nation is still in it."
            >
              Max Poss.
            </span>
          </div>
          {ordered.map((row, i) => {
            const userRounds = byUser.get(row.user_id);
            const bracketPts = bracketPointsOf(userRounds);
            const groupPts = groupPointsOf(userRounds);
            const tp3 = tp3ByUser.get(row.user_id) ?? { decided: 0, correct: 0, points: 0 };
            const koBonusPts = tpwByUser.get(row.user_id) ?? 0;
            const koWins = Math.round(koBonusPts / 5);
            const { rank, tied } = ranks[i];
            const displayRank = `${tied ? "T" : ""}${rank}`;
            const rankColor = rankColorClass(rank);
            return (
              <details key={row.user_id} className="border-b border-emerald-900/5 last:border-b-0 group">
                <summary className="px-5 py-3 cursor-pointer hover:bg-emerald-50/50 list-none">
                  {/* Desktop: single table row */}
                  <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(6,5rem)] gap-x-4 items-center">
                    <span className={`text-sm font-black w-7 ${rankColor}`}>{displayRank}</span>
                    <span className="font-semibold text-emerald-950 truncate">
                      {row.display_name}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(groupPts)}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(row.third_place_points)}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(bracketPts)}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(row.bonus_points)}
                    </span>
                    <span className="text-right text-base font-black text-emerald-950 tabular-nums">
                      {fmtPoints(row.total_points)}
                    </span>
                    <span className="text-right text-sm font-bold text-emerald-700 tabular-nums">
                      {fmtPoints(maxByUser.get(row.user_id) ?? row.total_points)}
                    </span>
                  </div>

                  {/* Mobile: stacked card */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-emerald-900/5 text-xs font-black tabular-nums ${rankColor}`}
                      >
                        {displayRank}
                      </span>
                      <span className="flex-1 min-w-0 font-bold text-base leading-tight text-emerald-950 break-words">
                        {row.display_name}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {[
                        { label: "Group", value: groupPts },
                        { label: "3rd Place", value: row.third_place_points },
                        { label: "Knockout", value: bracketPts },
                        { label: "Upset & GB", value: row.bonus_points },
                        { label: "Total", value: row.total_points, variant: "total" as const },
                        {
                          label: "Max Poss.",
                          value: maxByUser.get(row.user_id) ?? row.total_points,
                          variant: "max" as const,
                        },
                      ].map((s) => {
                        const variant = (s as { variant?: "total" | "max" }).variant;
                        return (
                          <div
                            key={s.label}
                            className={`rounded-lg px-1.5 py-1.5 text-center ${
                              variant === "total"
                                ? "bg-emerald-900/5"
                                : variant === "max"
                                  ? "bg-emerald-600/10"
                                  : ""
                            }`}
                          >
                            <div className="text-[8px] uppercase tracking-wide font-bold text-emerald-900/50 leading-tight">
                              {s.label}
                            </div>
                            <div
                              className={`tabular-nums leading-tight mt-0.5 ${
                                variant === "total"
                                  ? "text-base font-black text-emerald-950"
                                  : variant === "max"
                                    ? "text-base font-black text-emerald-700"
                                    : "text-sm font-semibold text-emerald-950/80"
                              }`}
                            >
                              {fmtPoints(s.value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </summary>
                <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-emerald-50/30">
                  {STAGE_ORDER.map((stage) => {
                    const r = userRounds?.get(stage);
                    return (
                      <div key={stage} className="card-pitch rounded-lg p-2.5">
                        <div className="text-[9px] uppercase tracking-widest font-bold text-emerald-800/70">
                          {STAGE_LABEL[stage]}
                        </div>
                        <div className="text-lg font-black text-emerald-950 leading-tight tabular-nums">
                          {fmtPoints(r?.points_earned ?? 0)}
                          <span className="text-[10px] text-emerald-800/50 font-semibold ml-1">pts</span>
                        </div>
                        <div className="text-[10px] text-emerald-900/60">
                          {r?.correct_picks ?? 0}/{r?.decided_picks ?? 0} correct
                        </div>
                      </div>
                    );
                  })}

                  {/* 3rd-place group picks — how many "which groups' 3rd-placer
                      advances" calls were right (3 pts each). */}
                  <div className="card-pitch rounded-lg p-2.5">
                    <div className="text-[9px] uppercase tracking-widest font-bold text-emerald-800/70">
                      3rd-Place Picks
                    </div>
                    <div className="text-lg font-black text-emerald-950 leading-tight tabular-nums">
                      {fmtPoints(tp3.points)}
                      <span className="text-[10px] text-emerald-800/50 font-semibold ml-1">pts</span>
                    </div>
                    <div className="text-[10px] text-emerald-900/60">
                      {tp3.correct}/{tp3.decided} correct
                    </div>
                  </div>

                  {/* 3rd-place knockout bonus — +5 per knockout match a picked
                      3rd-place qualifier won. Folds into the Bonus column. */}
                  <div className="card-pitch rounded-lg p-2.5">
                    <div className="text-[9px] uppercase tracking-widest font-bold text-emerald-800/70">
                      3rd-Place Bonus
                    </div>
                    <div className="text-lg font-black text-emerald-950 leading-tight tabular-nums">
                      {fmtPoints(koBonusPts)}
                      <span className="text-[10px] text-emerald-800/50 font-semibold ml-1">pts</span>
                    </div>
                    <div className="text-[10px] text-emerald-900/60">
                      {koWins} KO {koWins === 1 ? "win" : "wins"}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}

    </div>
  );
}
