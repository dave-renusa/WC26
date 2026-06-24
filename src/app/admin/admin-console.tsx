"use client";

import { useMemo, useState, useTransition } from "react";
import type { Match, Team, Stage } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import type {
  SyncLogRow,
  ThirdPlaceResultRow,
  TournamentSettings,
} from "./page";

interface Props {
  teams: Team[];
  matches: Match[];
  settings: TournamentSettings | null;
  thirdPlaceResults: ThirdPlaceResultRow[];
  recentSyncLog: SyncLogRow[];
}

const LOCK_FIELDS: Array<{ key: keyof TournamentSettings; label: string }> = [
  { key: "group_stage_lock_at", label: "Group stage" },
  { key: "third_place_lock_at", label: "3rd-place picks" },
  { key: "golden_boot_lock_at", label: "Golden Boot" },
  { key: "r32_lock_at", label: "Round of 32" },
  { key: "r16_lock_at", label: "Round of 16" },
  { key: "qf_lock_at", label: "Quarterfinals" },
  { key: "sf_lock_at", label: "Semifinals" },
  { key: "final_lock_at", label: "Final" },
];

const STAGES: Stage[] = ["group", "r32", "r16", "qf", "sf", "final"];
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

export function AdminConsole(props: Props) {
  const teamById = useMemo(() => new Map(props.teams.map((t) => [t.id, t])), [props.teams]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full space-y-12">
      <header>
        <h1 className="text-4xl font-black tracking-tighter text-emerald-950">Admin</h1>
        <p className="mt-1 text-sm text-emerald-950/60">
          Pull live results, override scores, manage locks. Service-role writes go straight
          to Supabase — no RLS in the way.
        </p>
      </header>

      <SyncSection log={props.recentSyncLog} teamById={teamById} />
      <SettingsSection settings={props.settings} />
      <GoldenBootSection winner={props.settings?.golden_boot_winner ?? ""} />
      <ThirdPlaceSection results={props.thirdPlaceResults} />
      <MatchesSection matches={props.matches} teamById={teamById} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Sync section

function SyncSection({
  log,
  teamById,
}: {
  log: SyncLogRow[];
  teamById: Map<number, Team>;
}) {
  const [report, setReport] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string>("");

  const runSync = (apply: boolean) => {
    setErr("");
    setReport("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sync/matches${apply ? "?apply=1" : ""}`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setErr(data.error || `HTTP ${res.status}`);
          return;
        }
        setReport(JSON.stringify(data, null, 2));
        if (apply) setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const codeOf = (id: number | null) => (id == null ? "—" : teamById.get(id)?.code ?? `#${id}`);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
          Live results sync
        </h2>
        <span className="text-xs text-emerald-900/40">ESPN · fifa.world</span>
      </div>
      <div className="card rounded-2xl p-5">
        <div className="flex flex-wrap gap-3">
          <button
            disabled={pending}
            onClick={() => runSync(false)}
            className="px-4 py-2 rounded-lg card hover:bg-emerald-50 text-sm font-semibold text-emerald-950 disabled:opacity-50"
          >
            {pending ? "Running…" : "Dry-run"}
          </button>
          <button
            disabled={pending}
            onClick={() => {
              if (confirm("Write changes to matches.score_a/score_b/winner_team_id?")) runSync(true);
            }}
            className="px-4 py-2 rounded-lg btn-pitch text-sm disabled:opacity-50"
          >
            {pending ? "Running…" : "Apply sync"}
          </button>
          <button
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Open the knockout bracket?\n\n" +
                    "This populates R32 teams from ESPN and locks all knockout picks at the first R32 kickoff. " +
                    "Run only after the group stage has ended and ESPN has revealed the R32 matchups.",
                )
              ) {
                setErr("");
                setReport("");
                startTransition(async () => {
                  try {
                    const res = await fetch("/api/admin/open-bracket", { method: "POST" });
                    const data = await res.json();
                    if (!res.ok) {
                      setErr(data.error || `HTTP ${res.status}`);
                      return;
                    }
                    setReport(JSON.stringify(data, null, 2));
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                });
              }
            }}
            className="px-4 py-2 rounded-lg btn-gold text-sm disabled:opacity-50"
          >
            {pending ? "Running…" : "Open bracket"}
          </button>
        </div>
        {err && (
          <pre className="mt-3 text-xs text-red-700 bg-red-50 rounded p-3 overflow-auto">{err}</pre>
        )}
        {report && (
          <pre className="mt-3 text-xs bg-emerald-950/95 text-emerald-100 rounded p-3 overflow-auto max-h-96">
            {report}
          </pre>
        )}

        <h3 className="mt-6 text-[10px] uppercase tracking-widest font-bold text-emerald-900/50">
          Recent sync log (50)
        </h3>
        {log.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-950/50">No sync runs yet.</p>
        ) : (
          <div className="mt-2 overflow-auto rounded border border-emerald-900/10">
            <table className="w-full text-xs">
              <thead className="bg-emerald-50/50">
                <tr className="text-left">
                  <th className="px-2 py-1.5">When</th>
                  <th className="px-2 py-1.5">Match</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Reason</th>
                  <th className="px-2 py-1.5">Prior</th>
                  <th className="px-2 py-1.5">Proposed</th>
                  <th className="px-2 py-1.5">DR</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-t border-emerald-900/5">
                    <td className="px-2 py-1 text-emerald-950/60 whitespace-nowrap">
                      {new Date(r.at).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 tabular-nums">#{r.match_id ?? "—"}</td>
                    <td className="px-2 py-1 font-semibold">{r.status}</td>
                    <td className="px-2 py-1 text-emerald-950/60">{r.reason ?? ""}</td>
                    <td className="px-2 py-1 tabular-nums">
                      {r.prior_score_a ?? "—"}-{r.prior_score_b ?? "—"} W:
                      {codeOf(r.prior_winner_id)}
                    </td>
                    <td className="px-2 py-1 tabular-nums">
                      {r.proposed_score_a ?? "—"}-{r.proposed_score_b ?? "—"} W:
                      {codeOf(r.proposed_winner_id)}
                    </td>
                    <td className="px-2 py-1">{r.dry_run ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Settings

function SettingsSection({ settings }: { settings: TournamentSettings | null }) {
  const [state, setState] = useState<TournamentSettings>(() => ({
    group_stage_lock_at: settings?.group_stage_lock_at ?? null,
    third_place_lock_at: settings?.third_place_lock_at ?? null,
    golden_boot_lock_at: settings?.golden_boot_lock_at ?? null,
    r32_lock_at: settings?.r32_lock_at ?? null,
    r16_lock_at: settings?.r16_lock_at ?? null,
    qf_lock_at: settings?.qf_lock_at ?? null,
    sf_lock_at: settings?.sf_lock_at ?? null,
    final_lock_at: settings?.final_lock_at ?? null,
    golden_boot_winner: settings?.golden_boot_winner ?? null,
    is_finalized: settings?.is_finalized ?? false,
    bracket_picks_open: settings?.bracket_picks_open ?? false,
  }));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const save = () => {
    setMsg("");
    startTransition(async () => {
      const payload: Record<string, string | boolean | null> = {
        is_finalized: state.is_finalized,
        bracket_picks_open: state.bracket_picks_open,
      };
      for (const f of LOCK_FIELDS) payload[f.key] = state[f.key] as string | null;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMsg(res.ok ? "Saved." : `Error: ${data.error}`);
    });
  };

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
        Round lock times
      </h2>
      <div className="card rounded-2xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {LOCK_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-[10px] uppercase tracking-widest font-bold text-emerald-900/50 mb-1">
                {f.label}
              </span>
              <input
                type="datetime-local"
                value={toLocalInput(state[f.key] as string | null)}
                onChange={(e) =>
                  setState((s) => ({ ...s, [f.key]: fromLocalInput(e.target.value) }))
                }
                className="w-full text-sm px-3 py-2 rounded-lg border border-emerald-900/15 bg-white"
              />
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.bracket_picks_open}
            onChange={(e) => setState((s) => ({ ...s, bracket_picks_open: e.target.checked }))}
          />
          <span>
            Bracket picks open (clickable) — off = everyone sees the bracket but can&apos;t pick yet
          </span>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.is_finalized}
            onChange={(e) => setState((s) => ({ ...s, is_finalized: e.target.checked }))}
          />
          <span>Tournament finalized (lock everything)</span>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={pending}
            onClick={save}
            className="px-4 py-2 rounded-lg btn-pitch text-sm disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save settings"}
          </button>
          {msg && <span className="text-xs text-emerald-900/70">{msg}</span>}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Golden Boot

function GoldenBootSection({ winner }: { winner: string }) {
  const [name, setName] = useState(winner);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const save = () => {
    setMsg("");
    startTransition(async () => {
      const res = await fetch("/api/admin/golden-boot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winner: name }),
      });
      const data = await res.json();
      setMsg(res.ok ? "Saved." : `Error: ${data.error}`);
    });
  };

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
        Golden Boot winner
      </h2>
      <div className="card rounded-2xl p-5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name (case/whitespace-insensitive match)"
          className="w-full text-sm px-3 py-2 rounded-lg border border-emerald-900/15 bg-white"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={pending}
            onClick={save}
            className="px-4 py-2 rounded-lg btn-gold text-sm disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save winner"}
          </button>
          {msg && <span className="text-xs text-emerald-900/70">{msg}</span>}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── 3rd-place

function ThirdPlaceSection({ results }: { results: ThirdPlaceResultRow[] }) {
  const initial = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of results) m[r.group_code] = r.advanced;
    return m;
  }, [results]);
  const [state, setState] = useState<Record<string, boolean>>(initial);
  const [pendingKey, setPendingKey] = useState<string>("");

  const toggle = async (g: string, advanced: boolean) => {
    setPendingKey(g);
    setState((s) => ({ ...s, [g]: advanced }));
    const res = await fetch("/api/admin/third-place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group_code: g, advanced }),
    });
    if (!res.ok) {
      alert(`Failed to save group ${g}`);
      setState((s) => ({ ...s, [g]: !advanced }));
    }
    setPendingKey("");
  };

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
        Best 3rd-place teams · who advances
      </h2>
      <div className="card rounded-2xl p-5">
        <p className="text-xs text-emerald-950/60 mb-3">
          Toggle ON for each group whose 3rd-placer is among the 8 advancing.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {GROUPS.map((g) => {
            const on = !!state[g];
            const busy = pendingKey === g;
            return (
              <button
                key={g}
                disabled={busy}
                onClick={() => toggle(g, !on)}
                className={`px-3 py-3 rounded-lg border text-sm font-bold transition ${
                  on
                    ? "bg-emerald-700 text-white border-emerald-800"
                    : "bg-white border-emerald-900/15 text-emerald-950/60 hover:bg-emerald-50"
                } disabled:opacity-50`}
              >
                Group {g}
                <div className="text-[10px] uppercase tracking-widest font-bold opacity-70 mt-0.5">
                  {on ? "advanced" : "out"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────── Matches

function MatchesSection({
  matches,
  teamById,
}: {
  matches: Match[];
  teamById: Map<number, Team>;
}) {
  const [stage, setStage] = useState<Stage>("group");
  const filtered = useMemo(
    () => matches.filter((m) => m.stage === stage),
    [matches, stage],
  );

  return (
    <section>
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
          Manual match overrides
        </h2>
        <div className="flex gap-1 text-xs">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                stage === s
                  ? "bg-emerald-700 text-white"
                  : "bg-white border border-emerald-900/15 text-emerald-950/60 hover:bg-emerald-50"
              }`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="card rounded-2xl p-5 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-emerald-950/50">No matches in this stage yet.</p>
        ) : (
          filtered.map((m) => (
            <MatchRow key={m.id} match={m} teamById={teamById} />
          ))
        )}
      </div>
    </section>
  );
}

function MatchRow({
  match,
  teamById,
}: {
  match: Match;
  teamById: Map<number, Team>;
}) {
  const teamA = match.team_a_id ? teamById.get(match.team_a_id) ?? null : null;
  const teamB = match.team_b_id ? teamById.get(match.team_b_id) ?? null : null;
  const [scoreA, setScoreA] = useState<string>(match.score_a == null ? "" : String(match.score_a));
  const [scoreB, setScoreB] = useState<string>(match.score_b == null ? "" : String(match.score_b));
  const [winnerId, setWinnerId] = useState<number | null>(match.winner_team_id);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  const save = () => {
    setMsg("");
    startTransition(async () => {
      const res = await fetch("/api/admin/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          match_id: match.id,
          score_a: scoreA === "" ? null : Number(scoreA),
          score_b: scoreB === "" ? null : Number(scoreB),
          winner_team_id: winnerId,
        }),
      });
      const data = await res.json();
      setMsg(res.ok ? "✓" : `Error: ${data.error}`);
    });
  };

  const kickoff = match.kickoff_at ? new Date(match.kickoff_at).toLocaleString() : "TBD";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_auto_auto_auto] gap-3 items-center py-2 border-b border-emerald-900/5 last:border-b-0">
      <div className="text-xs text-emerald-950/60">
        <span className="font-bold text-emerald-950">#{match.id}</span>
        <span className="mx-1.5">·</span>
        {match.group_code ? `Group ${match.group_code}` : `Slot ${match.bracket_slot ?? "?"}`}
        <div className="text-[10px] text-emerald-900/40">{kickoff}</div>
      </div>
      <div className="text-sm flex items-center gap-2">
        <span className="font-semibold text-emerald-950">
          {teamA?.code ?? "TBD"} ({teamA?.name ?? "—"})
        </span>
        <span className="text-emerald-900/40">vs</span>
        <span className="font-semibold text-emerald-950">
          {teamB?.code ?? "TBD"} ({teamB?.name ?? "—"})
        </span>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          className="w-14 text-sm px-2 py-1.5 rounded-lg border border-emerald-900/15 bg-white tabular-nums"
        />
        <span className="text-emerald-900/40">–</span>
        <input
          type="number"
          min="0"
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          className="w-14 text-sm px-2 py-1.5 rounded-lg border border-emerald-900/15 bg-white tabular-nums"
        />
      </div>
      <select
        value={winnerId == null ? "" : String(winnerId)}
        onChange={(e) =>
          setWinnerId(e.target.value === "" ? null : Number(e.target.value))
        }
        className="text-sm px-2 py-1.5 rounded-lg border border-emerald-900/15 bg-white"
      >
        <option value="">— winner —</option>
        {teamA && <option value={teamA.id}>{teamA.code}</option>}
        {teamB && <option value={teamB.id}>{teamB.code}</option>}
      </select>
      <div className="flex items-center gap-2">
        <button
          disabled={pending}
          onClick={save}
          className="px-3 py-1.5 rounded-lg btn-pitch text-xs disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        {msg && <span className="text-xs text-emerald-900/60">{msg}</span>}
      </div>
    </div>
  );
}
