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

const STAGE_ORDER: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];

function fmtPoints(n: number | null | undefined): string {
  if (n == null) return "0";
  // Half-points are real (drawn group games), so keep one decimal when needed.
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: rounds }, { data: settings }] = await Promise.all([
    supabase.from("v_leaderboard").select("*"),
    supabase.from("v_user_round_breakdown").select("*"),
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
          <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(4,4rem)] gap-x-4 px-5 py-3 text-[10px] uppercase tracking-widest font-bold text-emerald-900/50 border-b border-emerald-900/10">
            <span className="w-7">#</span>
            <span>Player</span>
            <span className="text-right">Matches</span>
            <span className="text-right">3rd-pl</span>
            <span className="text-right">Bonus</span>
            <span className="text-right">Total</span>
          </div>
          {leaderboard.map((row, i) => {
            const userRounds = byUser.get(row.user_id);
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
                  <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(4,4rem)] gap-x-4 items-center">
                    <span className={`text-sm font-black w-7 ${rankColor}`}>{i + 1}</span>
                    <span className="font-semibold text-emerald-950 truncate">
                      {row.display_name}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(row.match_points)}
                    </span>
                    <span className="text-right text-sm text-emerald-950/70 tabular-nums">
                      {fmtPoints(row.third_place_points)}
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
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[
                        { label: "Matches", value: row.match_points },
                        { label: "3rd-pl", value: row.third_place_points },
                        { label: "Bonus", value: row.bonus_points },
                        { label: "Total", value: row.total_points, total: true },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className={`rounded-lg px-2 py-1.5 text-center ${
                            s.total ? "bg-emerald-900/5" : ""
                          }`}
                        >
                          <div className="text-[9px] uppercase tracking-widest font-bold text-emerald-900/50">
                            {s.label}
                          </div>
                          <div
                            className={`tabular-nums leading-tight ${
                              s.total
                                ? "text-lg font-black text-emerald-950"
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
                <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-6 gap-2 bg-emerald-50/30">
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
                </div>
              </details>
            );
          })}
        </div>
      )}

    </div>
  );
}
