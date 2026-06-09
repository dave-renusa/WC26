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
  // Map ESPN's home/away → our team_a/team_b.
  const scoreA = pair.espnHomeIsOurA ? homeScore : awayScore;
  const scoreB = pair.espnHomeIsOurA ? awayScore : homeScore;

  let winnerId: number | null = null;
  if (homeScore != null && awayScore != null) {
    if (homeScore > awayScore) {
      winnerId = pair.espnHomeIsOurA ? pair.match.team_a_id! : pair.match.team_b_id!;
    } else if (awayScore > homeScore) {
      winnerId = pair.espnHomeIsOurA ? pair.match.team_b_id! : pair.match.team_a_id!;
    } else {
      // Draw: in group stage we leave winner_team_id null and let scoring view
      // award 0.5 pts via the draw rule. ESPN's `winner` flags are both false
      // on draws so we don't need them here.
      winnerId = null;
    }
  }
  return { scoreA, scoreB, winnerId };
}

export async function runSync(opts: SyncOptions): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const supabase = makeServiceClient();

  // Pull only what we need to keep payload small.
  const [{ data: matchRows, error: mErr }, { data: teamRows, error: tErr }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, kickoff_at, team_a_id, team_b_id, score_a, score_b, winner_team_id"),
      supabase.from("teams").select("id, code"),
    ]);
  if (mErr) throw new Error(`matches read: ${mErr.message}`);
  if (tErr) throw new Error(`teams read: ${tErr.message}`);

  const matches = (matchRows ?? []) as Array<
    OurMatchRow & { score_a: number | null; score_b: number | null; winner_team_id: number | null }
  >;
  const teams = (teamRows ?? []) as TeamRow[];

  let events: EspnEvent[];
  try {
    events = await fetchEspnEvents({ start: opts.start, end: opts.end });
  } catch (err) {
    return {
      source: "espn",
      windowStart: opts.start.toISOString(),
      windowEnd: opts.end.toISOString(),
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

    const noChange =
      row.score_a === decision.scoreA &&
      row.score_b === decision.scoreB &&
      row.winner_team_id === decision.winnerId;

    // Not yet completed → only log, never write.
    if (!(pair.event.state === "post" && pair.event.completed)) {
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

    // Admin already set a different winner — leave it.
    if (
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

    if (opts.dryRun) {
      entries.push({
        match_id: row.id,
        status: "planned",
        reason: "would-update",
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
        reason: "would-update",
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
      .update({
        score_a: decision.scoreA,
        score_b: decision.scoreB,
        winner_team_id: decision.winnerId,
      })
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
      reason: "espn-final",
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
      reason: "espn-final",
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

  return {
    source: "espn",
    windowStart: opts.start.toISOString(),
    windowEnd: opts.end.toISOString(),
    dryRun: opts.dryRun,
    espnEventCount: events.length,
    matchesConsidered: matches.length,
    entries,
    unmatchedEspnIds: unmatched.map((e) => e.id),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
