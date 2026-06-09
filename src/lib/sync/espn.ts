// ESPN free public scoreboard. No key, no quota in practice.
// Endpoint: https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
// dates= can be a single YYYYMMDD or a range YYYYMMDD-YYYYMMDD.

const BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

export type EspnState = "pre" | "in" | "post";

export interface EspnEvent {
  id: string;
  date: string; // ISO
  state: EspnState;
  completed: boolean;
  statusName: string; // STATUS_SCHEDULED | STATUS_IN_PROGRESS | STATUS_FINAL | STATUS_PENALTIES | ...
  shortDetail: string;
  homeCode: string;       // 3-letter abbreviation, lower-cased to canonicalize
  awayCode: string;
  homeScore: number | null;
  awayScore: number | null;
  // ESPN flags the winning side via competitor.winner
  homeWinner: boolean;
  awayWinner: boolean;
  raw: unknown;           // full event chunk for the audit log
}

interface EspnRaw {
  events?: Array<{
    id: string;
    date: string;
    competitions?: Array<{
      status?: {
        type?: {
          state?: string;
          completed?: boolean;
          name?: string;
          shortDetail?: string;
        };
      };
      competitors?: Array<{
        homeAway?: string;
        score?: string;
        winner?: boolean;
        team?: { abbreviation?: string };
      }>;
    }>;
  }>;
}

function toScore(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function fetchEspnEvents(opts: {
  start: Date;
  end: Date;
}): Promise<EspnEvent[]> {
  const dates =
    fmtDate(opts.start) === fmtDate(opts.end)
      ? fmtDate(opts.start)
      : `${fmtDate(opts.start)}-${fmtDate(opts.end)}`;
  const url = `${BASE}?dates=${dates}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ESPN ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as EspnRaw;

  const out: EspnEvent[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const type = comp?.status?.type;
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;

    out.push({
      id: ev.id,
      date: ev.date,
      state: ((type?.state as EspnState) ?? "pre"),
      completed: !!type?.completed,
      statusName: type?.name ?? "STATUS_UNKNOWN",
      shortDetail: type?.shortDetail ?? "",
      homeCode: home.team.abbreviation.toUpperCase(),
      awayCode: away.team.abbreviation.toUpperCase(),
      homeScore: toScore(home.score),
      awayScore: toScore(away.score),
      homeWinner: !!home.winner,
      awayWinner: !!away.winner,
      raw: ev,
    });
  }
  return out;
}
