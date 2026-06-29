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
  ] = await Promise.all([
    supabase.from("v_leaderboard").select("*"),
    supabase.from("v_user_round_breakdown").select("*"),
    supabase.from("v_third_place_scores").select("*"),
    supabase.from("v_third_place_winner_bonuses").select("*"),
    supabase.from("tournament_settings").select("group_stage_lock_at").eq("id", 1).single(),
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

  const lockAt = settings?.group_stage_lock_at as string | null | undefined;
  const tournamentStarted = lockAt ? Date.parse(lockAt) <= Date.now() : false;

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

      {leaderboard.length === 0 ? (
        <div className="mt-8 card rounded-2xl p-8 text-emerald-950/60">
          No players have signed up yet.
        </div>
      ) : (
        <div className="mt-8 card rounded-2xl overflow-hidden">
          {/* Column header — desktop table only; the mobile cards are self-labeled. */}
          <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(5,5.5rem)] items-end gap-x-4 px-5 py-3 text-[10px] uppercase tracking-wide font-bold text-emerald-900/50 border-b border-emerald-900/10">
            <span className="w-7">#</span>
            <span>Player</span>
            <span className="text-right">Group</span>
            <span className="text-right">3rd Place</span>
            <span className="text-right">Knockout</span>
            <span className="text-right">Upset &amp; GB Bonus</span>
            <span className="text-right">Total</span>
          </div>
          {leaderboard.map((row, i) => {
            const userRounds = byUser.get(row.user_id);
            const bracketPts = bracketPointsOf(userRounds);
            const groupPts = groupPointsOf(userRounds);
            const tp3 = tp3ByUser.get(row.user_id) ?? { decided: 0, correct: 0, points: 0 };
            const koBonusPts = tpwByUser.get(row.user_id) ?? 0;
            const koWins = Math.round(koBonusPts / 5);
            const rankColor =
              i === 0
                ? "text-gold"
                : i === 1
                  ? "text-emerald-900"
                  : i === 2
                    ? "text-amber-800"
                    : "text-emerald-900/40";
            return (
              <details key={row.user_id} className="border-b border-emerald-900/5 last:border-b-0 group">
                <summary className="px-5 py-3 cursor-pointer hover:bg-emerald-50/50 list-none">
                  {/* Desktop: single table row */}
                  <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(5,5.5rem)] gap-x-4 items-center">
                    <span className={`text-sm font-black w-7 ${rankColor}`}>{i + 1}</span>
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
                  </div>

                  {/* Mobile: stacked card */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-emerald-900/5 text-xs font-black tabular-nums ${rankColor}`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 font-bold text-base leading-tight text-emerald-950 break-words">
                        {row.display_name}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-1.5">
                      {[
                        { label: "Group", value: groupPts },
                        { label: "3rd Place", value: row.third_place_points },
                        { label: "Knockout", value: bracketPts },
                        { label: "Upset & GB", value: row.bonus_points },
                        { label: "Total", value: row.total_points, total: true },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className={`rounded-lg px-1.5 py-1.5 text-center ${
                            s.total ? "bg-emerald-900/5" : ""
                          }`}
                        >
                          <div className="text-[8px] uppercase tracking-wide font-bold text-emerald-900/50 leading-tight">
                            {s.label}
                          </div>
                          <div
                            className={`tabular-nums leading-tight mt-0.5 ${
                              s.total
                                ? "text-base font-black text-emerald-950"
                                : "text-sm font-semibold text-emerald-950/80"
                            }`}
                          >
                            {fmtPoints(s.value)}
                          </div>
                        </div>
                      ))}
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
