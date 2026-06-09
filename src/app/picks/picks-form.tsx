"use client";

import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Team, Match } from "@/lib/types";

type Props = {
  userId: string;
  teams: Team[];
  matches: Match[];
  initialPicks: Record<number, number>;
  initialThirdPlace: string[];
  initialGoldenBoot: string;
  groupStageLockAt: string | null;
};

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function fmtKickoff(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function PicksForm({
  userId,
  teams,
  matches,
  initialPicks,
  initialThirdPlace,
  initialGoldenBoot,
  groupStageLockAt,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [picks, setPicks] = useState<Record<number, number>>(initialPicks);
  const [thirdPlace, setThirdPlace] = useState<Set<string>>(new Set(initialThirdPlace));
  const [goldenBoot, setGoldenBoot] = useState(initialGoldenBoot);
  const [savedFlash, setSavedFlash] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const groupStageLocked =
    !!groupStageLockAt && new Date(groupStageLockAt).getTime() <= Date.now();

  const teamsById = useMemo(() => {
    const m = new Map<number, Team>();
    teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [teams]);

  const teamsByGroup = useMemo(() => {
    const m = new Map<string, Team[]>();
    GROUPS.forEach((g) => m.set(g, []));
    teams.forEach((t) => m.get(t.group_code)?.push(t));
    return m;
  }, [teams]);

  const matchesByGroup = useMemo(() => {
    const m = new Map<string, Match[]>();
    GROUPS.forEach((g) => m.set(g, []));
    matches.forEach((mm) => mm.group_code && m.get(mm.group_code)?.push(mm));
    return m;
  }, [matches]);

  const matchPicksMade = Object.keys(picks).length;
  const thirdPlaceCount = thirdPlace.size;

  function isMatchLocked(match: Match): boolean {
    if (groupStageLocked) return true;
    if (!match.kickoff_at) return false;
    return new Date(match.kickoff_at).getTime() <= Date.now();
  }

  async function selectWinner(matchId: number, teamId: number) {
    const previous = picks[matchId];
    if (previous === teamId) return;

    setPicks((p) => ({ ...p, [matchId]: teamId }));
    setSavedFlash(matchId);

    const { error } = await supabase
      .from("picks")
      .upsert(
        { user_id: userId, match_id: matchId, predicted_winner_team_id: teamId },
        { onConflict: "user_id,match_id" },
      );

    if (error) {
      // Roll back optimistic update
      setPicks((p) => {
        const next = { ...p };
        if (previous == null) delete next[matchId];
        else next[matchId] = previous;
        return next;
      });
      alert(`Couldn't save: ${error.message}`);
      return;
    }
    setTimeout(() => setSavedFlash((curr) => (curr === matchId ? null : curr)), 900);
  }

  async function toggleThirdPlace(groupCode: string) {
    const currentlyOn = thirdPlace.has(groupCode);
    if (!currentlyOn && thirdPlace.size >= 8) {
      alert("You can only pick 8 groups. Unselect one first.");
      return;
    }
    const next = new Set(thirdPlace);
    if (currentlyOn) next.delete(groupCode);
    else next.add(groupCode);
    setThirdPlace(next);

    if (currentlyOn) {
      const { error } = await supabase
        .from("third_place_picks")
        .delete()
        .eq("user_id", userId)
        .eq("group_code", groupCode);
      if (error) {
        next.add(groupCode);
        setThirdPlace(new Set(next));
        alert(`Couldn't save: ${error.message}`);
      }
    } else {
      const { error } = await supabase
        .from("third_place_picks")
        .insert({ user_id: userId, group_code: groupCode });
      if (error) {
        next.delete(groupCode);
        setThirdPlace(new Set(next));
        alert(`Couldn't save: ${error.message}`);
      }
    }
  }

  async function saveGoldenBoot(value: string) {
    setGoldenBoot(value);
    startTransition(async () => {
      await supabase
        .from("bonus_picks")
        .upsert(
          { user_id: userId, golden_boot_player: value.trim() || null },
          { onConflict: "user_id" },
        );
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-emerald-950">My Picks</h1>
          <p className="mt-1 text-sm text-emerald-950/60">
            Click a team to pick the winner. Saves on click.
            {groupStageLocked && (
              <span className="ml-2 text-red-700 font-semibold">🔒 Group stage locked</span>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="card rounded-xl px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
              Matches
            </div>
            <div className="font-black text-emerald-950">
              <span className="text-2xl">{matchPicksMade}</span>
              <span className="text-emerald-950/40"> / 72</span>
            </div>
          </div>
          <div className="card rounded-xl px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
              3rd Place
            </div>
            <div className="font-black text-emerald-950">
              <span className="text-2xl">{thirdPlaceCount}</span>
              <span className="text-emerald-950/40"> / 8</span>
            </div>
          </div>
          <div className="card rounded-xl px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
              Boot
            </div>
            <div className="font-black text-emerald-950 text-2xl">
              {goldenBoot.trim() ? "✓" : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <section className="card-pitch rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow">
            📋
          </div>
          <div className="text-sm text-emerald-950 leading-relaxed">
            <div className="font-bold mb-1 text-base">How to fill out your bracket</div>
            <ul className="space-y-1 list-disc list-inside marker:text-emerald-700">
              <li>
                <strong>Click a team in each match</strong> to lock in your winner pick. Saves
                instantly — no submit button.
              </li>
              <li>
                <strong>Pick all 72 group matches.</strong> Anything left blank is 0 points. The
                counter at the top right tells you how many are done.
              </li>
              <li>
                <strong>Drawn group games</strong> earn{" "}
                <strong>0.5 pts</strong> for picking either team — your team didn&apos;t lose.
              </li>
              <li>
                <strong>Then scroll past the matches</strong> for two bonus picks: 8 best
                3rd-place groups (3 pts each) and the Golden Boot scorer (15 pts).
              </li>
              <li>
                <strong>Everything locks at the first kickoff</strong>{" "}
                <span className="text-emerald-800 font-semibold">
                  (Thursday, June 11 · 3:00 PM ET)
                </span>
                . No edits after that.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Group cards (matches up top) */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {GROUPS.map((g) => {
          const groupTeams = teamsByGroup.get(g) ?? [];
          const groupMatches = matchesByGroup.get(g) ?? [];
          const teamNames = groupTeams.map((t) => t.name).join(" · ");
          return (
            <div key={g} className="card rounded-2xl overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 px-5 py-4 flex items-start gap-3">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center">
                  <span className="text-2xl font-black text-white tracking-tighter">{g}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/70 font-bold">
                      Group {g}
                    </div>
                    <div className="shrink-0 flex gap-1">
                      {groupTeams.map((t) => (
                        <img
                          key={t.id}
                          src={`https://flagcdn.com/16x12/${t.flag_code}.png`}
                          alt={t.name}
                          title={t.name}
                          width={16}
                          height={12}
                          className="rounded-[1px] shadow"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white leading-snug break-words">
                    {teamNames}
                  </div>
                </div>
              </div>
              <div className="divide-y divide-emerald-900/8">
                {groupMatches.map((m) => {
                  const teamA = m.team_a_id ? teamsById.get(m.team_a_id) : null;
                  const teamB = m.team_b_id ? teamsById.get(m.team_b_id) : null;
                  if (!teamA || !teamB) return null;
                  const picked = picks[m.id];
                  const locked = isMatchLocked(m);
                  const justSaved = savedFlash === m.id;
                  return (
                    <div key={m.id} className="px-4 py-3">
                      <div className="flex items-center justify-between text-[10px] text-emerald-900/50 mb-2 font-semibold uppercase tracking-widest">
                        <span>Matchday {m.matchday}</span>
                        <span className="flex items-center gap-1.5">
                          {justSaved && (
                            <span className="text-emerald-700 font-bold normal-case tracking-normal">
                              Saved ✓
                            </span>
                          )}
                          {locked && <span className="text-red-700">🔒 Locked</span>}
                          <span>{fmtKickoff(m.kickoff_at)}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[teamA, teamB].map((t) => {
                          const selected = picked === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => selectWinner(m.id, t.id)}
                              data-selected={selected}
                              data-locked={locked}
                              disabled={locked}
                              className="pick-btn rounded-lg px-3 py-2.5 flex items-center gap-2 text-left"
                            >
                              <img
                                src={`https://flagcdn.com/20x15/${t.flag_code}.png`}
                                alt={t.name}
                                width={20}
                                height={15}
                                className="rounded-[1px] shrink-0"
                              />
                              <span className="text-sm font-semibold text-emerald-950 truncate">
                                {t.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Bonus picks (moved below matches) */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Bonus picks · don&apos;t forget these
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card-pitch rounded-2xl p-5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold mb-1">
                  2026 only · 3 pts each
                </div>
                <div className="text-lg font-bold text-emerald-950">Best 3rd-place teams</div>
                <p className="text-xs text-emerald-900/70">
                  Pick 8 groups whose 3rd-placer advances to the R32.
                </p>
              </div>
              <div className="text-sm font-bold text-emerald-900">
                {thirdPlaceCount} / 8
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 mt-3">
              {GROUPS.map((g) => {
                const on = thirdPlace.has(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleThirdPlace(g)}
                    disabled={groupStageLocked}
                    className={`py-2 rounded-lg font-black text-sm border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      on
                        ? "bg-emerald-700 text-white border-emerald-800 shadow-md"
                        : "bg-white text-emerald-900 border-emerald-900/15 hover:border-emerald-700"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-gold rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold mb-1">
              Bonus · 15 pts
            </div>
            <div className="text-lg font-bold text-emerald-950 mb-1">Golden Boot pick</div>
            <p className="text-xs text-emerald-950/60 mb-3">
              Who scores the most goals at the tournament?
            </p>
            <input
              type="text"
              value={goldenBoot}
              onChange={(e) => saveGoldenBoot(e.target.value)}
              disabled={groupStageLocked}
              placeholder="e.g. Erling Haaland"
              className="w-full px-3 py-2.5 rounded-lg border border-amber-700/20 bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/40 focus:border-amber-600 text-emerald-950 disabled:opacity-60"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
