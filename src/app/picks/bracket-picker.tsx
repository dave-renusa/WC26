"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Team, Match, Stage } from "@/lib/types";

interface Props {
  userId: string;
  teams: Team[];
  knockoutMatches: Match[];
  initialPicks: Record<number, number>;
  initialFinalTotalGoals: number | null;
  bracketLockAt: string | null;
  // When false, the bracket is visible but read-only (picks not open yet).
  picksOpen: boolean;
}

// Stage order for the bracket flow. R32 has real teams from ESPN; R16+ derive
// from the player's own picks in the prior round (strict bracket UX).
const KNOCKOUT_STAGES: Stage[] = ["r32", "r16", "qf", "sf", "final"];

const STAGE_DISPLAY: Record<Stage, { title: string; columns: number }> = {
  group: { title: "Group Stage", columns: 0 },
  r32:   { title: "Round of 32",  columns: 4 },
  r16:   { title: "Round of 16",  columns: 4 },
  qf:    { title: "Quarterfinals", columns: 4 },
  sf:    { title: "Semifinals",   columns: 2 },
  final: { title: "Final",        columns: 1 },
};

export function BracketPicker(props: Props) {
  const supabase = useMemo(() => createClient(), []);
  const teamById = useMemo(() => new Map(props.teams.map((t) => [t.id, t])), [props.teams]);

  // Map of all knockout matches by id for quick lookup.
  const matchById = useMemo(
    () => new Map(props.knockoutMatches.map((m) => [m.id, m])),
    [props.knockoutMatches],
  );

  // Group matches by stage, sorted by bracket_slot.
  const matchesByStage = useMemo(() => {
    const m: Record<string, Match[]> = {};
    for (const stage of KNOCKOUT_STAGES) m[stage] = [];
    for (const match of props.knockoutMatches) m[match.stage]?.push(match);
    for (const stage of KNOCKOUT_STAGES) {
      m[stage].sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0));
    }
    return m;
  }, [props.knockoutMatches]);

  const [picks, setPicks] = useState<Record<number, number>>(props.initialPicks);
  const [pendingMatch, setPendingMatch] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [, startTransition] = useTransition();

  // Tiebreaker: predicted total goals in the Final. Stored on bonus_picks.
  const [finalGoals, setFinalGoals] = useState<string>(
    props.initialFinalTotalGoals == null ? "" : String(props.initialFinalTotalGoals),
  );
  const [goalsSaved, setGoalsSaved] = useState(false);

  // Locked by the first-R32-kickoff deadline.
  const lockedByTime = useMemo(() => {
    if (!props.bracketLockAt) return false;
    return Date.parse(props.bracketLockAt) <= Date.now();
  }, [props.bracketLockAt]);
  // Read-only when picks aren't open yet, or once the deadline has passed.
  const readOnly = !props.picksOpen || lockedByTime;
  const emptyLabel = readOnly ? "TBD" : "Pick prior round";

  // Given a match, return the two teams that should appear as choices for
  // THIS player. For R32 these are the actual teams. For R16+ these are the
  // player's own picks from the predecessor matches (strict-bracket).
  function teamsForMatch(match: Match): [Team | null, Team | null] {
    if (match.stage === "r32") {
      return [
        match.team_a_id ? teamById.get(match.team_a_id) ?? null : null,
        match.team_b_id ? teamById.get(match.team_b_id) ?? null : null,
      ];
    }
    const aPred = match.team_a_from_match_id;
    const bPred = match.team_b_from_match_id;
    const aPickedTeamId = aPred != null ? picks[aPred] : null;
    const bPickedTeamId = bPred != null ? picks[bPred] : null;
    return [
      aPickedTeamId ? teamById.get(aPickedTeamId) ?? null : null,
      bPickedTeamId ? teamById.get(bPickedTeamId) ?? null : null,
    ];
  }

  function clearDependentPicks(match: Match, mutator: Record<number, number>): void {
    // When R32 #k changes, any R16 pick depending on R32 #k via its
    // team_a/b_from_match_id reference may now be invalid (the team they
    // picked is no longer one of their two advancing options). Cascade
    // through subsequent rounds and clear stale dependents.
    const successors = props.knockoutMatches.filter(
      (m) => m.team_a_from_match_id === match.id || m.team_b_from_match_id === match.id,
    );
    for (const succ of successors) {
      // Whatever they picked for succ — is that team still one of the two
      // teams that will appear there after this change? Use a recursive
      // teamsForMatch-style probe but against the mutator state.
      const [a, b] = teamsForMatchAgainst(succ, mutator);
      const currentPick = mutator[succ.id];
      if (currentPick != null && currentPick !== a?.id && currentPick !== b?.id) {
        delete mutator[succ.id];
        clearDependentPicks(succ, mutator);
      }
    }
  }

  function teamsForMatchAgainst(match: Match, source: Record<number, number>): [Team | null, Team | null] {
    if (match.stage === "r32") {
      return [
        match.team_a_id ? teamById.get(match.team_a_id) ?? null : null,
        match.team_b_id ? teamById.get(match.team_b_id) ?? null : null,
      ];
    }
    const aPred = match.team_a_from_match_id;
    const bPred = match.team_b_from_match_id;
    const aPickedTeamId = aPred != null ? source[aPred] : null;
    const bPickedTeamId = bPred != null ? source[bPred] : null;
    return [
      aPickedTeamId ? teamById.get(aPickedTeamId) ?? null : null,
      bPickedTeamId ? teamById.get(bPickedTeamId) ?? null : null,
    ];
  }

  // Delete later-round picks that are no longer reachable after a change or
  // clear (their feeder pick moved or was removed). `matchId` itself is handled
  // by the caller, so it's excluded here.
  async function deleteClearedDependents(
    nextPicks: Record<number, number>,
    matchId: number,
  ) {
    const cleared = Object.keys(picks)
      .map(Number)
      .filter((id) => id !== matchId && picks[id] != null && nextPicks[id] == null);
    if (cleared.length > 0) {
      await supabase
        .from("picks")
        .delete()
        .eq("user_id", props.userId)
        .in("match_id", cleared);
    }
  }

  async function pickWinner(matchId: number, teamId: number) {
    if (readOnly || pendingMatch !== null) return;
    if (picks[matchId] === teamId) return; // already this pick — nothing to do
    setErrMsg("");
    setPendingMatch(matchId);

    // Build the new picks state, cascading clears for now-unreachable dependents.
    const nextPicks = { ...picks, [matchId]: teamId };
    const match = matchById.get(matchId);
    if (match) clearDependentPicks(match, nextPicks);

    startTransition(async () => {
      const { error } = await supabase.from("picks").upsert(
        {
          user_id: props.userId,
          match_id: matchId,
          predicted_winner_team_id: teamId,
        },
        { onConflict: "user_id,match_id" },
      );
      if (error) {
        setErrMsg(`Save failed: ${error.message}`);
        setPendingMatch(null);
        return;
      }
      await deleteClearedDependents(nextPicks, matchId);
      setPicks(nextPicks);
      setPendingMatch(null);
    });
  }

  // Clear a single matchup's pick (the ✕ on the card), cascading the clear to
  // any later-round picks that fed off it.
  async function clearPick(matchId: number) {
    if (readOnly || pendingMatch !== null) return;
    if (picks[matchId] == null) return;
    setErrMsg("");
    setPendingMatch(matchId);

    const nextPicks = { ...picks };
    delete nextPicks[matchId];
    const match = matchById.get(matchId);
    if (match) clearDependentPicks(match, nextPicks);

    startTransition(async () => {
      const { error } = await supabase
        .from("picks")
        .delete()
        .eq("user_id", props.userId)
        .eq("match_id", matchId);
      if (error) {
        setErrMsg(`Couldn't clear pick: ${error.message}`);
        setPendingMatch(null);
        return;
      }
      await deleteClearedDependents(nextPicks, matchId);
      setPicks(nextPicks);
      setPendingMatch(null);
    });
  }

  function saveFinalGoals(raw: string) {
    // Keep only digits; empty clears the prediction.
    const cleaned = raw.replace(/[^0-9]/g, "");
    setFinalGoals(cleaned);
    setGoalsSaved(false);
    if (readOnly) return;
    const value = cleaned === "" ? null : Number(cleaned);
    startTransition(async () => {
      const { error } = await supabase.from("bonus_picks").upsert(
        { user_id: props.userId, predicted_final_total_goals: value },
        { onConflict: "user_id" },
      );
      if (error) {
        setErrMsg(`Tiebreaker save failed: ${error.message}`);
        return;
      }
      setGoalsSaved(true);
    });
  }

  const totalPicked = useMemo(
    () =>
      props.knockoutMatches.filter((m) => picks[m.id] != null).length,
    [picks, props.knockoutMatches],
  );

  // Centered NCAA-style tree (desktop). Built recursively from the bracket
  // wiring: each match's two feeders come from team_a/b_from_match_id, so the
  // left half is the subtree rooted at SF #1 and the right half at SF #2, with
  // the Final in the middle. Falls back to the stacked layout on mobile.
  const sfMatches = matchesByStage["sf"] ?? [];
  const finalMatch = (matchesByStage["final"] ?? [])[0];
  const treeReady = sfMatches.length >= 2 && !!finalMatch;

  function cellFor(match: Match, widthClass: string): ReactNode {
    return (
      <div className={`${widthClass} shrink-0`}>
        <BracketCard
          match={match}
          teams={teamsForMatch(match)}
          picked={picks[match.id] ?? null}
          locked={readOnly}
          pending={pendingMatch === match.id}
          onPick={(teamId) => pickWinner(match.id, teamId)}
          onClear={() => clearPick(match.id)}
          emptyLabel={emptyLabel}
        />
      </div>
    );
  }

  function renderSubtree(match: Match, dir: "l" | "r"): ReactNode {
    const kids = [
      match.team_a_from_match_id != null ? matchById.get(match.team_a_from_match_id) : undefined,
      match.team_b_from_match_id != null ? matchById.get(match.team_b_from_match_id) : undefined,
    ].filter((m): m is Match => !!m);

    const cell = cellFor(match, "w-24");
    if (kids.length < 2) return cell; // R32 leaf

    const childCol = (
      <div className="flex flex-col justify-center gap-2">
        {renderSubtree(kids[0], dir)}
        {renderSubtree(kids[1], dir)}
      </div>
    );
    const conn = (
      <div className={`bk-conn ${dir === "l" ? "bk-conn-l" : "bk-conn-r"}`} aria-hidden />
    );

    return (
      <div className="flex items-center">
        {dir === "l" ? (
          <>
            {childCol}
            {conn}
            {cell}
          </>
        ) : (
          <>
            {cell}
            {conn}
            {childCol}
          </>
        )}
      </div>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-6 py-12 w-full">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-950">
          Your bracket
        </h2>
        <div className="text-xs text-emerald-900/60 flex items-center gap-3">
          <span>
            {totalPicked} / 31 picks made
          </span>
          <span className="text-emerald-900/40">
            {!props.picksOpen
              ? "👀 Preview · picks open soon"
              : lockedByTime
                ? "🔒 Locked"
                : props.bracketLockAt
                  ? `Locks ${new Date(props.bracketLockAt).toLocaleString()}`
                  : "Open for picks"}
          </span>
        </div>
      </div>

      {readOnly && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {lockedByTime
            ? "🔒 The bracket is locked — picks are final."
            : "👀 Preview only — the bracket isn’t open for picks yet. Have a look around; you’ll be able to fill it out once picks open."}
        </div>
      )}

      <p className="text-sm text-emerald-950/70 mb-6 max-w-2xl leading-relaxed">
        Pick winners for all 31 knockout matches at once. Your R32 picks advance to fill
        R16 slots, R16 winners fill QF slots, and so on. Change a pick in an earlier round and
        the affected later picks reset — pick again from your new bracket path. To undo a
        pick, hit the ✕ on that matchup.
      </p>

      {errMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {errMsg}
        </div>
      )}

      {/* Desktop: centered NCAA-style bracket tree */}
      {treeReady && (
        <div className="hidden lg:block overflow-x-auto pb-4">
          <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-900/40 mb-3">
            <span>R32 · R16 · QF · SF</span>
            <span className="text-amber-700">Final</span>
            <span>SF · QF · R16 · R32</span>
          </div>
          <div className="flex items-stretch justify-center min-w-max mx-auto px-2">
            {renderSubtree(sfMatches[0], "l")}
            <div className="bk-line" aria-hidden />
            <div className="flex flex-col justify-center">
              <div className="text-[10px] uppercase tracking-widest text-amber-700 font-bold text-center mb-1">
                🏆 Final
              </div>
              {cellFor(finalMatch, "w-28")}
            </div>
            <div className="bk-line" aria-hidden />
            {renderSubtree(sfMatches[1], "r")}
          </div>
        </div>
      )}

      {/* Mobile (and fallback): stacked rounds */}
      <div className={`space-y-6 ${treeReady ? "lg:hidden" : ""}`}>
        {KNOCKOUT_STAGES.map((stage) => {
          const stageMatches = matchesByStage[stage] ?? [];
          if (stageMatches.length === 0) return null;
          return (
            <div key={stage}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
                  {STAGE_DISPLAY[stage].title}
                </h3>
                <span className="text-xs text-emerald-900/40">
                  {stageMatches.filter((m) => picks[m.id] != null).length} / {stageMatches.length}
                </span>
              </div>
              <div
                className={`grid gap-2`}
                style={{
                  gridTemplateColumns: `repeat(${Math.min(
                    STAGE_DISPLAY[stage].columns,
                    stageMatches.length,
                  )}, minmax(0, 1fr))`,
                }}
              >
                {stageMatches.map((m) => (
                  <BracketCard
                    key={m.id}
                    match={m}
                    teams={teamsForMatch(m)}
                    picked={picks[m.id] ?? null}
                    locked={readOnly}
                    pending={pendingMatch === m.id}
                    onPick={(teamId) => pickWinner(m.id, teamId)}
                    onClear={() => clearPick(m.id)}
                    emptyLabel={emptyLabel}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tiebreaker — predicted total goals in the Final */}
      <div className="card-gold rounded-2xl p-5 mt-6 max-w-md">
        <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold mb-1">
          Tiebreaker
        </div>
        <div className="text-lg font-bold text-emerald-950 mb-1">Total goals in the Final</div>
        <p className="text-xs text-emerald-950/60 mb-3">
          Combined goals by both teams in the Final (regulation + extra time). If players
          finish level on points, closest guess wins.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={finalGoals}
            onChange={(e) => saveFinalGoals(e.target.value)}
            disabled={readOnly}
            placeholder="e.g. 3"
            className="w-28 text-sm px-3 py-2.5 rounded-lg border border-amber-700/20 bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/40 disabled:opacity-60 tabular-nums"
          />
          {goalsSaved && !readOnly && (
            <span className="text-xs font-bold text-emerald-700">Saved ✓</span>
          )}
          {readOnly && (
            <span className="text-xs font-semibold text-amber-700">
              {lockedByTime ? "🔒 Locked" : "Opens soon"}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function BracketCard({
  match,
  teams,
  picked,
  locked,
  pending,
  onPick,
  onClear,
  emptyLabel,
}: {
  match: Match;
  teams: [Team | null, Team | null];
  picked: number | null;
  locked: boolean;
  pending: boolean;
  onPick: (teamId: number) => void;
  onClear: () => void;
  emptyLabel: string;
}) {
  const [a, b] = teams;
  const ko = match.kickoff_at ? new Date(match.kickoff_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (
    <div className="card rounded-xl p-2.5 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] uppercase tracking-widest text-emerald-900/40 font-bold">
          Match {match.bracket_slot}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[9px] text-emerald-900/40">{ko}</span>
          {picked != null && !locked && (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              title="Clear this pick"
              aria-label="Clear this pick"
              className="text-[10px] leading-none text-emerald-900/40 hover:text-red-600 disabled:opacity-40 transition"
            >
              ✕
            </button>
          )}
        </span>
      </div>
      {/* R32 opponents that aren't locked yet are always TBD (a real team we
          just don't know yet); later rounds defer to the parent's label, which
          is "Pick prior round" when picks are open and "TBD" in read-only/locked
          preview. */}
      <TeamButton
        team={a}
        selected={picked != null && a?.id === picked}
        disabled={locked || pending || a == null}
        emptyLabel={match.stage === "r32" ? "TBD" : emptyLabel}
        onClick={() => a && onPick(a.id)}
      />
      <div className="text-center text-[9px] text-emerald-900/30 font-bold my-0.5">vs</div>
      <TeamButton
        team={b}
        selected={picked != null && b?.id === picked}
        disabled={locked || pending || b == null}
        emptyLabel={match.stage === "r32" ? "TBD" : emptyLabel}
        onClick={() => b && onPick(b.id)}
      />
    </div>
  );
}

function TeamButton({
  team,
  selected,
  disabled,
  emptyLabel,
  onClick,
}: {
  team: Team | null;
  selected: boolean;
  disabled: boolean;
  emptyLabel: string;
  onClick: () => void;
}) {
  if (!team) {
    return (
      <div className="w-full px-2 py-1.5 rounded-md bg-emerald-900/5 text-emerald-900/30 text-[11px] text-center italic">
        {emptyLabel}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full px-2 py-1.5 rounded-md text-left flex items-center gap-1.5 transition ${
        selected
          ? "bg-gradient-to-br from-amber-100 to-emerald-100 border border-amber-400 shadow-sm font-bold text-emerald-950"
          : "bg-white border border-emerald-900/10 hover:bg-emerald-50 text-emerald-950/80"
      } ${disabled && !selected ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <img
        src={`https://flagcdn.com/16x12/${team.flag_code}.png`}
        alt=""
        width={16}
        height={12}
        className="rounded-[1px] shrink-0"
      />
      <span className="text-[11px] truncate">{team.code}</span>
    </button>
  );
}
