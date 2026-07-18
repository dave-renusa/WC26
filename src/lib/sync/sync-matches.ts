// Core sync engine. Pulls ESPN events for a date window, pairs them with our
// matches, decides what to write, and (unless dry-run) writes through a
// service-role client.
//
// Safety rules:
//   1. Only act on events ESPN reports as completed (status.type.completed===true
//      AND state==='post'). Live/scheduled events are logged but skipped.
//   2. Only touch matches whose team_a_id AND team_b_id are populated.
//      Knockouts before their bracket is filled won't accidentally update.
//   3. Never overwrite a result that admin has already set differently — if our
//      row has a winner_team_id that doesn't match ESPN's, log as 'conflict'
//      and leave it alone (admin always wins).
//   4. Idempotent: if our row already matches ESPN, log 'noop' without writing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchEspnEvents, type EspnEvent } from "./espn";
import { resolveEvents, type ResolvedPair, type OurMatchRow, type TeamRow } from "./resolve";
import { fillFromCompletedGroups } from "./group-standings";
import { fillKnockoutFromWinners } from "./knockout-advance";

export interface SyncOptions {
  start: Date;
  end: Date;
  dryRun: boolean;
}

export interface SyncEntry {
  match_id: number | null;
  status: "applied" | "skipped" | "planned" | "noop" | "conflict" | "error";
  reason: string;
  espn_event_id?: string;
  proposed_score_a?: number | null;
  proposed_score_b?: number | null;
  proposed_winner_id?: number | null;
  prior_score_a?: number | null;
  prior_score_b?: number | null;
  prior_winner_id?: number | null;
}

export interface SyncReport {
  source: "espn";
  windowStart: string;
  windowEnd: string;
  dryRun: boolean;
  espnEventCount: number;
  matchesConsidered: number;
  entries: SyncEntry[];
  unmatchedEspnIds: string[];
  startedAt: string;
  finishedAt: string;
}

function makeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decideWriter(pair: ResolvedPair): {
  scoreA: number | null;
  scoreB: number | null;
  winnerId: number | null;
} {
  const ev = pair.event;
  const homeScore = ev.homeScore;
  const awayScore = ev.awayScore;
  // Map ESPN's home/away → our team_a/team_b. In populate mode we use the
  // resolved IDs (which followed ESPN's home → team_a convention).
  const scoreA = pair.espnHomeIsOurA ? homeScore : awayScore;
  const scoreB = pair.espnHomeIsOurA ? awayScore : homeScore;

  const teamAId = pair.resolvedTeamAId;
  const teamBId = pair.resolvedTeamBId;
  const isKnockout = pair.match.stage !== "group";

  let winnerId: number | null = null;
  if (homeScore != null && awayScore != null) {
    if (isKnockout) {
      // Knockouts can end on penalty shootouts; ESPN's `score` is reg+ET only,
      // so a 1-1 with a winner flagged is a PK result. Always defer to
      // competitor.winner — it's set correctly for FT, AET, and PK outcomes.
      if (ev.homeWinner) {
        winnerId = pair.espnHomeIsOurA ? teamAId : teamBId;
      } else if (ev.awayWinner) {
        winnerId = pair.espnHomeIsOurA ? teamBId : teamAId;
      }
      // else null — only happens pre-final or on a status anomaly
    } else if (homeScore > awayScore) {
      winnerId = pair.espnHomeIsOurA ? teamAId : teamBId;
    } else if (awayScore > homeScore) {
      winnerId = pair.espnHomeIsOurA ? teamBId : teamAId;
    } else {
      // Group-stage draw: leave winner_team_id null; the scoring view awards
      // 0.5 pts via the draw rule.
      winnerId = null;
    }
  }
  return { scoreA, scoreB, winnerId };
}

// Once ESPN has populated the R32 teams, set every knockout lock time to the
// first R32 kickoff so the whole bracket opens for picks and freezes at that
// moment. No-op once r32_lock_at is already set (idempotent). Mirrors the
// manual /api/admin/open-bracket action so the bracket opens hands-free.
async function maybeAutoOpenBracket(supabase: SupabaseClient): Promise<void> {
  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("r32_lock_at")
    .eq("id", 1)
    .single();
  if (settings?.r32_lock_at) return; // already opened

  const { data: r32 } = await supabase
    .from("matches")
    .select("kickoff_at, team_a_id, team_b_id")
    .eq("stage", "r32")
    .order("kickoff_at", { ascending: true });

  const rows = r32 ?? [];
  const ready = rows.some((m) => m.team_a_id != null && m.team_b_id != null);
  if (!ready) return; // bracket not populated yet

  // Query is ordered ascending, so the first non-null kickoff is the earliest.
  const firstKickoff =
    rows.map((m) => m.kickoff_at as string | null).find((k) => !!k) ??
    "2026-06-28T16:00:00+00:00";

  await supabase
    .from("tournament_settings")
    .update({
      r32_lock_at: firstKickoff,
      r16_lock_at: firstKickoff,
      qf_lock_at: firstKickoff,
      sf_lock_at: firstKickoff,
      final_lock_at: firstKickoff,
    })
    .eq("id", 1);
}

export async function runSync(opts: SyncOptions): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const supabase = makeServiceClient();

  // Pull only what we need to keep payload small.
  const [{ data: matchRows, error: mErr }, { data: teamRows, error: tErr }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, stage, kickoff_at, team_a_id, team_b_id, score_a, score_b, winner_team_id"),
      supabase.from("teams").select("id, code"),
    ]);
  if (mErr) throw new Error(`matches read: ${mErr.message}`);
  if (tErr) throw new Error(`teams read: ${tErr.message}`);

  const matches = (matchRows ?? []) as Array<
    OurMatchRow & { score_a: number | null; score_b: number | null; winner_team_id: number | null }
  >;
  const teams = (teamRows ?? []) as TeamRow[];

  // Until the bracket is open, extend the fetch window to cover the R32 dates so
  // knockout teams populate AUTOMATICALLY the moment ESPN swaps group-stage
  // placeholders for real matchups — no daily check-in or manual "Open bracket"
  // needed. Once r32_lock_at is set, the window stays as requested and we're back
  // to plain result syncing. Writes are all idempotent, so the wider window is
  // safe to run every cron tick.
  let start = opts.start;
  let end = opts.end;
  const { data: openCheck } = await supabase
    .from("tournament_settings")
    .select("r32_lock_at")
    .eq("id", 1)
    .single();
  if (!openCheck?.r32_lock_at) {
    const popStart = new Date("2026-06-26T00:00:00Z");
    const popEnd = new Date("2026-07-05T00:00:00Z");
    if (popStart < start) start = popStart;
    if (popEnd > end) end = popEnd;
  }

  let events: EspnEvent[];
  try {
    events = await fetchEspnEvents({ start, end });
  } catch (err) {
    return {
      source: "espn",
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      dryRun: opts.dryRun,
      espnEventCount: 0,
      matchesConsidered: matches.length,
      entries: [
        {
          match_id: null,
          status: "error",
          reason: `espn fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      unmatchedEspnIds: [],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const { resolved, unmatched } = resolveEvents({
    events,
    matches,
    teams,
  });

  const entries: SyncEntry[] = [];
  const logRows: Record<string, unknown>[] = [];

  for (const pair of resolved) {
    const row = matches.find((m) => m.id === pair.match.id)!;
    const decision = decideWriter(pair);
    const isFinal = pair.event.state === "post" && pair.event.completed;

    // Build the update payload. Populate mode (knockout slots being filled
    // from ESPN) writes team_a_id/team_b_id/kickoff_at even pre-match. Final
    // mode adds score_a/score_b/winner_team_id. Both can apply in one pair.
    const update: Record<string, number | string | null> = {};
    if (pair.populateMode) {
      update.team_a_id = pair.resolvedTeamAId;
      update.team_b_id = pair.resolvedTeamBId;
      update.kickoff_at = pair.event.date;
    }
    if (isFinal) {
      update.score_a = decision.scoreA;
      update.score_b = decision.scoreB;
      update.winner_team_id = decision.winnerId;
    }

    if (Object.keys(update).length === 0) {
      // Nothing actionable — strict match with a non-final event, no populate.
      entries.push({
        match_id: row.id,
        status: "skipped",
        reason: `not-final (${pair.event.statusName}, state=${pair.event.state})`,
        espn_event_id: pair.event.id,
        proposed_score_a: pair.event.homeScore,
        proposed_score_b: pair.event.awayScore,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
      });
      logRows.push({
        match_id: row.id,
        source: "espn",
        status: "skipped",
        reason: `not-final (${pair.event.statusName})`,
        dry_run: opts.dryRun,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
        payload: pair.event.raw as object,
      });
      continue;
    }

    // No-change detection: every key in `update` already matches the row.
    const noChange = Object.entries(update).every(([k, v]) => {
      const current = (row as unknown as Record<string, unknown>)[k] ?? null;
      return current === (v ?? null);
    });

    // Admin already set a different winner — leave it. Only relevant when
    // we're attempting to write winner_team_id.
    if (
      isFinal &&
      row.winner_team_id != null &&
      decision.winnerId != null &&
      row.winner_team_id !== decision.winnerId
    ) {
      entries.push({
        match_id: row.id,
        status: "conflict",
        reason: "admin-set-winner-differs",
        espn_event_id: pair.event.id,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
      });
      logRows.push({
        match_id: row.id,
        source: "espn",
        status: "conflict",
        reason: "admin-set-winner-differs",
        dry_run: opts.dryRun,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
        payload: pair.event.raw as object,
      });
      continue;
    }

    if (noChange) {
      entries.push({
        match_id: row.id,
        status: "noop",
        reason: "already-up-to-date",
        espn_event_id: pair.event.id,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
      });
      continue;
    }

    const actionLabel =
      pair.populateMode && isFinal
        ? "populate-teams+finalize"
        : pair.populateMode
          ? "populate-teams"
          : "finalize";

    if (opts.dryRun) {
      entries.push({
        match_id: row.id,
        status: "planned",
        reason: `would-${actionLabel}`,
        espn_event_id: pair.event.id,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
      });
      logRows.push({
        match_id: row.id,
        source: "espn",
        status: "planned",
        reason: `would-${actionLabel}`,
        dry_run: true,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
        payload: pair.event.raw as object,
      });
      continue;
    }

    const { error: upErr } = await supabase
      .from("matches")
      .update(update)
      .eq("id", row.id);

    if (upErr) {
      entries.push({
        match_id: row.id,
        status: "error",
        reason: `update failed: ${upErr.message}`,
        espn_event_id: pair.event.id,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
      });
      logRows.push({
        match_id: row.id,
        source: "espn",
        status: "error",
        reason: upErr.message,
        dry_run: false,
        proposed_score_a: decision.scoreA,
        proposed_score_b: decision.scoreB,
        proposed_winner_id: decision.winnerId,
        prior_score_a: row.score_a,
        prior_score_b: row.score_b,
        prior_winner_id: row.winner_team_id,
        payload: pair.event.raw as object,
      });
      continue;
    }

    entries.push({
      match_id: row.id,
      status: "applied",
      reason: actionLabel,
      espn_event_id: pair.event.id,
      proposed_score_a: decision.scoreA,
      proposed_score_b: decision.scoreB,
      proposed_winner_id: decision.winnerId,
      prior_score_a: row.score_a,
      prior_score_b: row.score_b,
      prior_winner_id: row.winner_team_id,
    });
    logRows.push({
      match_id: row.id,
      source: "espn",
      status: "applied",
      reason: actionLabel,
      dry_run: false,
      proposed_score_a: decision.scoreA,
      proposed_score_b: decision.scoreB,
      proposed_winner_id: decision.winnerId,
      prior_score_a: row.score_a,
      prior_score_b: row.score_b,
      prior_winner_id: row.winner_team_id,
      payload: pair.event.raw as object,
    });
  }

  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from("match_sync_log").insert(logRows);
    if (logErr) {
      entries.push({
        match_id: null,
        status: "error",
        reason: `audit log write failed: ${logErr.message}`,
      });
    }
  }

  // Fully auto-open the bracket: the first time an applied sync leaves any R32
  // match with both teams populated, lock the whole knockout bracket at the
  // first R32 kickoff. One-time transition (skips if locks already set), so
  // it's safe to evaluate on every cron pass.
  if (!opts.dryRun) {
    // Place the winner + runner-up of any group that has finished into their R32
    // slots, so the bracket fills in group by group as the tournament progresses.
    try {
      await fillFromCompletedGroups(supabase);
    } catch (err) {
      entries.push({
        match_id: null,
        status: "error",
        reason: `group-standings fill failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    // Advance winners down the knockout bracket from our own results. Runs after
    // the group fill and after resolveEvents has written this pass's results, so
    // a Final whose semifinals just finished is filled in the same pass — and any
    // slot a stray event (e.g. the third-place playoff) mis-populated is corrected.
    try {
      await fillKnockoutFromWinners(supabase);
    } catch (err) {
      entries.push({
        match_id: null,
        status: "error",
        reason: `knockout advance failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    try {
      await maybeAutoOpenBracket(supabase);
    } catch (err) {
      entries.push({
        match_id: null,
        status: "error",
        reason: `auto-open check failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    source: "espn",
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    dryRun: opts.dryRun,
    espnEventCount: events.length,
    matchesConsidered: matches.length,
    entries,
    unmatchedEspnIds: unmatched.map((e) => e.id),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
