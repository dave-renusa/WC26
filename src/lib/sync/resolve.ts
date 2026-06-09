// Pair an ESPN event to one of our matches rows.
//
// Two-phase matching:
//   Phase 1 — strict: our row has team_a_id + team_b_id. Match by kickoff
//             ±24h AND unordered team-code pair. Group-stage path.
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

  // ─── Phase 2: populate (empty knockout slots) ────────────────────────
  const finalUnmatched: EspnEvent[] = [];
  for (const ev of remainingEvents) {
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
