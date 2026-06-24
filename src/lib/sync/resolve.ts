// Pair an ESPN event to one of our matches rows.
//
// Two-phase matching:
//   Phase 1 — strict: our row has team_a_id + team_b_id. Match by kickoff
//             ±24h AND unordered team-code pair. Group-stage path.
//   Phase 1.5 — single-side: our row already has ONE team (e.g. a group
//             winner pinned into its R32 slot before groups ended). Match an
//             event whose pair INCLUDES that known team, within ±72h, and fill
//             only the empty side. Keeps the pinned team in place. Runs before
//             phase 2 so a known team always claims its own event rather than
//             being grabbed by a both-NULL row on date alone.
//   Phase 2 — populate: our row has NULL teams (knockout slots before they're
//             filled). Match by kickoff date proximity alone (±72h), greedy
//             nearest-neighbor against still-unmatched events. The matched
//             pair carries `populateMode = true` so the sync writes team_a_id,
//             team_b_id, and kickoff_at.
//
// Codes are uppercased on both sides so casing drift doesn't break it.

import type { EspnEvent } from "./espn";

export interface OurMatchRow {
  id: number;
  stage: string;
  kickoff_at: string | null;
  team_a_id: number | null;
  team_b_id: number | null;
}

export interface TeamRow {
  id: number;
  code: string;
}

export interface ResolvedPair {
  match: OurMatchRow;
  event: EspnEvent;
  // For populated rows, whether ESPN's home corresponds to our team_a.
  // For populate-mode rows (teams were null), espnHomeIsOurA is true by
  // convention — we assign ESPN's home team to team_a_id.
  espnHomeIsOurA: boolean;
  populateMode: boolean;
  // Team IDs to write. For strict mode these are read from the row.
  // For populate mode these are looked up from team codes against TeamRow[].
  resolvedTeamAId: number;
  resolvedTeamBId: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STRICT_WINDOW_MS = ONE_DAY_MS;
const POPULATE_WINDOW_MS = 3 * ONE_DAY_MS;

export function resolveEvents(opts: {
  events: EspnEvent[];
  matches: OurMatchRow[];
  teams: TeamRow[];
}): { resolved: ResolvedPair[]; unmatched: EspnEvent[] } {
  const codeById = new Map<number, string>();
  const idByCode = new Map<string, number>();
  for (const t of opts.teams) {
    const up = t.code.toUpperCase();
    codeById.set(t.id, up);
    idByCode.set(up, t.id);
  }

  const resolved: ResolvedPair[] = [];
  const usedMatchIds = new Set<number>();
  const remainingEvents: EspnEvent[] = [];

  // ─── Phase 1: strict (populated rows) ────────────────────────────────
  for (const ev of opts.events) {
    const evT = Date.parse(ev.date);
    if (!Number.isFinite(evT)) {
      remainingEvents.push(ev);
      continue;
    }
    const pair = new Set([ev.homeCode, ev.awayCode]);

    let best: { row: OurMatchRow; dt: number } | null = null;
    for (const m of opts.matches) {
      if (usedMatchIds.has(m.id)) continue;
      if (m.team_a_id == null || m.team_b_id == null) continue;
      const aCode = codeById.get(m.team_a_id);
      const bCode = codeById.get(m.team_b_id);
      if (!aCode || !bCode) continue;
      if (!pair.has(aCode) || !pair.has(bCode)) continue;
      if (m.kickoff_at == null) continue;
      const ko = Date.parse(m.kickoff_at);
      if (!Number.isFinite(ko)) continue;
      const dt = Math.abs(ko - evT);
      if (dt > STRICT_WINDOW_MS) continue;
      if (best == null || dt < best.dt) best = { row: m, dt };
    }

    if (best == null) {
      remainingEvents.push(ev);
      continue;
    }
    usedMatchIds.add(best.row.id);
    const ourACode = codeById.get(best.row.team_a_id!)!;
    resolved.push({
      match: best.row,
      event: ev,
      espnHomeIsOurA: ev.homeCode === ourACode,
      populateMode: false,
      resolvedTeamAId: best.row.team_a_id!,
      resolvedTeamBId: best.row.team_b_id!,
    });
  }

  // ─── Phase 1.5: single-side (fill the empty side of a half-pinned row) ─
  // A row with exactly one known team (a group winner pinned into its R32 slot
  // before groups ended). Only fill it from an event that (a) has BOTH teams in
  // our roster and (b) includes the pinned team. That guard means we never
  // attach an opponent until groups are actually over — pre-group ESPN events
  // carry placeholder codes ("3RD A/B/C/D/F") that aren't in our roster, so they
  // fall through. It also keeps a group-stage rematch (same two teams) from
  // leaking in, because phase 1 has already consumed those into the group row.
  const afterSingleSide: EspnEvent[] = [];
  for (const ev of remainingEvents) {
    const evT = Date.parse(ev.date);
    if (!Number.isFinite(evT)) {
      afterSingleSide.push(ev);
      continue;
    }
    const homeId = idByCode.get(ev.homeCode);
    const awayId = idByCode.get(ev.awayCode);
    if (homeId == null || awayId == null) {
      afterSingleSide.push(ev);
      continue;
    }

    let best: { row: OurMatchRow; dt: number } | null = null;
    for (const m of opts.matches) {
      if (usedMatchIds.has(m.id)) continue;
      const aKnown = m.team_a_id != null;
      const bKnown = m.team_b_id != null;
      if (aKnown === bKnown) continue; // need EXACTLY one side known
      const knownId = aKnown ? m.team_a_id! : m.team_b_id!;
      if (knownId !== homeId && knownId !== awayId) continue; // event must contain it
      if (m.kickoff_at == null) continue;
      const ko = Date.parse(m.kickoff_at);
      if (!Number.isFinite(ko)) continue;
      const dt = Math.abs(ko - evT);
      if (dt > POPULATE_WINDOW_MS) continue;
      if (best == null || dt < best.dt) best = { row: m, dt };
    }

    if (best == null) {
      afterSingleSide.push(ev);
      continue;
    }
    usedMatchIds.add(best.row.id);
    const aKnown = best.row.team_a_id != null;
    const knownId = aKnown ? best.row.team_a_id! : best.row.team_b_id!;
    const otherId = knownId === homeId ? awayId : homeId;
    const resolvedTeamAId = aKnown ? knownId : otherId;
    const resolvedTeamBId = aKnown ? otherId : knownId;
    resolved.push({
      match: best.row,
      event: ev,
      espnHomeIsOurA: ev.homeCode === codeById.get(resolvedTeamAId),
      populateMode: true,
      resolvedTeamAId,
      resolvedTeamBId,
    });
  }

  // ─── Phase 2: populate (empty knockout slots) ────────────────────────
  const finalUnmatched: EspnEvent[] = [];
  for (const ev of afterSingleSide) {
    const evT = Date.parse(ev.date);
    if (!Number.isFinite(evT)) {
      finalUnmatched.push(ev);
      continue;
    }
    const homeId = idByCode.get(ev.homeCode);
    const awayId = idByCode.get(ev.awayCode);
    if (homeId == null || awayId == null) {
      // One of the teams isn't in our roster — skip rather than mis-attribute.
      finalUnmatched.push(ev);
      continue;
    }

    let best: { row: OurMatchRow; dt: number } | null = null;
    for (const m of opts.matches) {
      if (usedMatchIds.has(m.id)) continue;
      if (m.team_a_id != null || m.team_b_id != null) continue;
      if (m.kickoff_at == null) continue;
      const ko = Date.parse(m.kickoff_at);
      if (!Number.isFinite(ko)) continue;
      const dt = Math.abs(ko - evT);
      if (dt > POPULATE_WINDOW_MS) continue;
      if (best == null || dt < best.dt) best = { row: m, dt };
    }

    if (best == null) {
      finalUnmatched.push(ev);
      continue;
    }
    usedMatchIds.add(best.row.id);
    resolved.push({
      match: best.row,
      event: ev,
      espnHomeIsOurA: true, // by convention: ESPN home → our team_a
      populateMode: true,
      resolvedTeamAId: homeId,
      resolvedTeamBId: awayId,
    });
  }

  return { resolved, unmatched: finalUnmatched };
}
