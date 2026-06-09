"use client";

import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Team, Match, Stage } from "@/lib/types";

interface Props {
  userId: string;
  teams: Team[];
  knockoutMatches: Match[];
  initialPicks: Record<number, number>;
  bracketLockAt: string | null;
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

  const isLocked = useMemo(() => {
    if (!props.bracketLockAt) return false;
    return Date.parse(props.bracketLockAt) <= Date.now();
  }, [props.bracketLockAt]);

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

  async function pickWinner(matchId: number, teamId: number) {
    if (isLocked || pendingMatch !== null) return;
    setErrMsg("");
    setPendingMatch(matchId);

    // Build the new picks state, cascading clears for dependents.
    const nextPicks = { ...picks, [matchId]: teamId };
    const match = matchById.get(matchId);
    if (match) clearDependentPicks(match, nextPicks);

    // Persist this pick. Dependent clears we do client-side only — the picks
    // table has cascade FKs but we don't actually delete picks for dependent
    // rounds, we just clear them in the UI. That's fine: if a player picks
    // R32 #1 = Brazil → R16 #1 = Brazil, then changes R32 #1 to France, the
    // R16 #1 = Brazil row stays in the DB but is shown as cleared and the
    // user re-picks. Cleaner alternative: delete the stale picks server-side.
    // Skipping that for now since dependent deletes require extra round-trips
    // and reconcile on next render anyway.
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
      // Persist the clears in the DB too — delete dependent picks that are
      // no longer valid.
      const cleared = Object.keys(picks)
        .map(Number)
        .filter((id) => picks[id] != null && nextPicks[id] == null);
      if (cleared.length > 0) {
        await supabase
          .from("picks")
          .delete()
          .eq("user_id", props.userId)
          .in("match_id", cleared);
      }
      setPicks(nextPicks);
      setPendingMatch(null);
    });
  }

  const totalPicked = useMemo(
    () =>
      props.knockoutMatches.filter((m) => picks[m.id] != null).length,
    [picks, props.knockoutMatches],
  );

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
          {props.bracketLockAt && (
            <span className="text-emerald-900/40">
              {isLocked
                ? "Locked"
                : `Locks ${new Date(props.bracketLockAt).toLocaleString()}`}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-emerald-950/70 mb-6 max-w-2xl leading-relaxed">
        Pick winners for all 31 knockout matches at once. Your R32 picks advance to fill
        R16 slots, R16 winners fill QF slots, and so on. Change a pick in an earlier round and
        the affected later picks reset — pick again from your new bracket path.
      </p>

      {errMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {errMsg}
        </div>
      )}

      <div className="space-y-6">
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
                    locked={isLocked}
                    pending={pendingMatch === m.id}
                    onPick={(teamId) => pickWinner(m.id, teamId)}
                  />
                ))}
              </div>
            </div>
          );
        })}
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
}: {
  match: Match;
  teams: [Team | null, Team | null];
  picked: number | null;
  locked: boolean;
  pending: boolean;
  onPick: (teamId: number) => void;
}) {
  const [a, b] = teams;
  const ko = match.kickoff_at ? new Date(match.kickoff_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (
    <div className="card rounded-xl p-2.5 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] uppercase tracking-widest text-emerald-900/40 font-bold">
          M{match.bracket_slot}
        </span>
        <span className="text-[9px] text-emerald-900/40">{ko}</span>
      </div>
      <TeamButton
        team={a}
        selected={picked != null && a?.id === picked}
        disabled={locked || pending || a == null}
        onClick={() => a && onPick(a.id)}
      />
      <div className="text-center text-[9px] text-emerald-900/30 font-bold my-0.5">vs</div>
      <TeamButton
        team={b}
        selected={picked != null && b?.id === picked}
        disabled={locked || pending || b == null}
        onClick={() => b && onPick(b.id)}
      />
    </div>
  );
}

function TeamButton({
  team,
  selected,
  disabled,
  onClick,
}: {
  team: Team | null;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  if (!team) {
    return (
      <div className="w-full px-2 py-1.5 rounded-md bg-emerald-900/5 text-emerald-900/30 text-[11px] text-center italic">
        Pick prior round
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
