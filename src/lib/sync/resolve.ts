// Pair an ESPN event to one of our matches rows.
// Strategy: kickoff within ±24h AND the unordered pair of team codes matches.
// Codes are uppercased on both sides so casing drift doesn't break it.

import type { EspnEvent } from "./espn";

export interface OurMatchRow {
  id: number;
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
  // Whether ESPN's home corresponds to our team_a. Drives which side's score
  // becomes score_a vs score_b on write.
  espnHomeIsOurA: boolean;
  ourACode: string;
  ourBCode: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function resolveEvents(opts: {
  events: EspnEvent[];
  matches: OurMatchRow[];
  teams: TeamRow[];
}): { resolved: ResolvedPair[]; unmatched: EspnEvent[] } {
  const codeById = new Map<number, string>();
  for (const t of opts.teams) codeById.set(t.id, t.code.toUpperCase());

  const resolved: ResolvedPair[] = [];
  const used = new Set<number>();
  const unmatched: EspnEvent[] = [];

  for (const ev of opts.events) {
    const evT = Date.parse(ev.date);
    if (!Number.isFinite(evT)) {
      unmatched.push(ev);
      continue;
    }
    const pair = new Set([ev.homeCode, ev.awayCode]);

    let best: { row: OurMatchRow; dt: number } | null = null;
    for (const m of opts.matches) {
      if (used.has(m.id)) continue;
      if (m.team_a_id == null || m.team_b_id == null) continue;
      const aCode = codeById.get(m.team_a_id);
      const bCode = codeById.get(m.team_b_id);
      if (!aCode || !bCode) continue;
      if (!pair.has(aCode) || !pair.has(bCode)) continue;
      if (m.kickoff_at == null) continue;
      const ko = Date.parse(m.kickoff_at);
      if (!Number.isFinite(ko)) continue;
      const dt = Math.abs(ko - evT);
      if (dt > ONE_DAY_MS) continue;
      if (best == null || dt < best.dt) best = { row: m, dt };
    }

    if (best == null) {
      unmatched.push(ev);
      continue;
    }
    used.add(best.row.id);
    const ourACode = codeById.get(best.row.team_a_id!)!;
    const ourBCode = codeById.get(best.row.team_b_id!)!;
    resolved.push({
      match: best.row,
      event: ev,
      espnHomeIsOurA: ev.homeCode === ourACode,
      ourACode,
      ourBCode,
    });
  }
  return { resolved, unmatched };
}
