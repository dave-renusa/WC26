import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const POOL_ENTRY = {
  amount: 25,
  venmoHandle: "David-DOnofrio-03",
};

// Payout structure: top 3 at 60/25/15. The pool passed 10 players, so the
// old small-pool tier (top 2 at 70/30) was retired.
const PAYOUT = {
  split: [0.6, 0.25, 0.15],
  places: ["1st", "2nd", "3rd"] as const,
};

function computePayouts(playerCount: number): {
  pot: number;
  amounts: number[];
} {
  const pot = playerCount * POOL_ENTRY.amount;
  // Floor each payout to the nearest $5 for clean, easy-to-pay numbers; the
  // remainder rolls to 1st place so the math always sums exactly to the pot.
  // (e.g. a 31-player $775 pot pays out $470 / $190 / $115.)
  const rounded = PAYOUT.split.map((pct) => Math.floor((pot * pct) / 5) * 5);
  const remainder = pot - rounded.reduce((a, b) => a + b, 0);
  rounded[0] += remainder;
  return { pot, amounts: rounded };
}

const ROUNDS = [
  { label: "Group Stage", points: 1, games: 72 },
  { label: "Round of 32", points: 1, games: 16 },
  { label: "Round of 16", points: 3, games: 8 },
  { label: "Quarterfinals", points: 5, games: 4 },
  { label: "Semifinals", points: 8, games: 2 },
  { label: "Final", points: 13, games: 1 },
];

const HOST_FLAGS = [
  { code: "us", name: "USA" },
  { code: "ca", name: "Canada" },
  { code: "mx", name: "Mexico" },
];

// Two pick windows. Groups before kickoff, then the full knockout bracket
// (R32 → Final, all 31 matches in one sitting) once groups end.
const PICK_WINDOWS = [
  {
    id: "group",
    label: "Group Stage",
    matches: 72,
    lockBy: "2026-06-11",
    lockLabel: "Thu Jun 11 · 3pm ET",
    sub: "Pick every group game + Golden Boot + 3rd-place card",
  },
  {
    id: "bracket",
    label: "The Bracket",
    matches: 31,
    lockBy: "2026-06-28",
    lockLabel: "Sun Jun 28 · 12pm ET",
    sub: "R32 → R16 → QF → SF → Final, all at once. Your picks advance.",
  },
] as const;

function getCurrentWindowId(): string | null {
  const now = Date.now();
  for (const w of PICK_WINDOWS) {
    if (Date.parse(`${w.lockBy}T00:00:00Z`) > now) return w.id;
  }
  return null;
}

export default async function Home() {
  // Player count is best-effort — if Supabase is unreachable, the page should
  // still render with a 0 fallback rather than crash on first load.
  // Reads from v_leaderboard rather than profiles directly so anonymous
  // homepage visitors can see it (profiles RLS is authenticated-only; the
  // view bypasses RLS by running as the view creator).
  let playerCount = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("v_leaderboard")
      .select("*", { count: "exact", head: true });
    playerCount = count ?? 0;
  } catch {
    /* fallback to 0 */
  }
  const payouts = computePayouts(playerCount);
  const currentWindowId = getCurrentWindowId();

  return (
    <div className="flex-1 flex flex-col">
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-16 w-full">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full card-pitch text-xs mb-6 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-900">Kickoff · June 11, 2026</span>
          <span className="text-emerald-900/30">·</span>
          <span className="flex items-center gap-1">
            {HOST_FLAGS.map((f) => (
              <img
                key={f.code}
                src={`https://flagcdn.com/16x12/${f.code}.png`}
                alt={f.name}
                width={16}
                height={12}
                className="inline-block rounded-[1px] shadow-sm"
              />
            ))}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
          <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.95]">
            <span className="block text-emerald-950">Pick every match.</span>
            <span className="block text-gold">Lift the trophy.</span>
          </h1>
          <img
            src="/wctroph-transparent.png"
            alt="2026 FIFA World Cup — USA · Canada · Mexico"
            width={419}
            height={520}
            className="h-40 sm:h-44 lg:h-52 w-auto shrink-0 self-center sm:self-auto drop-shadow-sm"
          />
        </div>

        <p className="mt-6 text-lg text-emerald-950/70 max-w-2xl leading-relaxed">
          The 2026 World Cup bracket pool for people who actually watch every group game.
          Pick all 72 group matches, then fill out your full bracket once groups end —
          R32 through the Final, all at once.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login" className="px-7 py-3.5 rounded-xl btn-gold text-base">
            Join the Pool →
          </Link>
          <Link
            href="/rules"
            className="px-7 py-3.5 rounded-xl card hover:bg-emerald-50 transition font-semibold text-emerald-950"
          >
            See the Rules
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-12 w-full">
        <div className="card-pitch rounded-2xl p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold mb-2">
              Pool Entry · Venmo
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-black text-emerald-950">${POOL_ENTRY.amount}</span>
              <span className="text-sm text-emerald-900/60 font-medium">per player</span>
            </div>
            <p className="text-sm text-emerald-950/70 leading-relaxed mb-4 max-w-md">
              Buy in via Venmo to <strong>@{POOL_ENTRY.venmoHandle}</strong>. Memo your display name
              so I can match payment to picks. Pool closes at kickoff of match #1.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://venmo.com/u/${POOL_ENTRY.venmoHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg btn-pitch text-sm"
              >
                Pay ${POOL_ENTRY.amount} on Venmo →
              </a>
              <a
                href={`https://venmo.com/u/${POOL_ENTRY.venmoHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-emerald-900/80 hover:text-emerald-950"
              >
                @{POOL_ENTRY.venmoHandle}
              </a>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white rounded-xl p-2 shadow-md border border-emerald-900/10">
              {/* Drop your Venmo QR at public/venmo-qr.png. Hidden via onError fallback. */}
              <img
                src="/venmo-qr.png"
                alt="Venmo QR — David D'Onofrio"
                width={160}
                height={160}
                className="block"
              />
            </div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
              Scan to pay
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-12 w-full">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
            Two pick windows · One bracket, no second chances
          </h2>
          <span className="text-xs text-emerald-900/40">
            Sign up, pick, come back once
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PICK_WINDOWS.map((w, i) => {
            const isCurrent = w.id === currentWindowId;
            const isPast =
              currentWindowId === null ||
              PICK_WINDOWS.findIndex((x) => x.id === currentWindowId) > i;
            return (
              <div
                key={w.id}
                className={`relative rounded-2xl p-5 transition ${
                  isCurrent
                    ? "card-gold ring-2 ring-amber-500/40"
                    : isPast
                      ? "card opacity-50"
                      : "card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-emerald-900/40 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">
                      Now
                    </span>
                  )}
                  {isPast && (
                    <span className="text-[9px] text-emerald-900/40">✓</span>
                  )}
                </div>
                <div className="text-xl font-black text-emerald-950 leading-tight">
                  {w.label}
                </div>
                <div className="text-sm text-emerald-900/70 mt-1">
                  {w.matches} matches
                </div>
                <div className="text-xs text-emerald-950/60 mt-2 leading-relaxed">
                  {w.sub}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-900/40 font-bold mt-3">
                  Locks {w.lockLabel}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-4">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              n: 1,
              t: "Sign in",
              d: "Magic-link email. No passwords, no accounts to manage.",
              tone: "navy",
            },
            {
              n: 2,
              t: "Pick all 72 group games",
              d: "Before the tournament starts. Picks lock at kickoff of match #1.",
              tone: "pitch",
            },
            {
              n: 3,
              t: "Fill out your full bracket",
              d: "Once groups end, pick all 31 knockout matches at once. Strict bracket — your R32 picks advance through R16 to the Final.",
              tone: "red",
            },
          ].map((s) => {
            const badge =
              s.tone === "pitch"
                ? "bg-emerald-700 text-white"
                : s.tone === "navy"
                  ? "bg-[var(--usa-navy)] text-white"
                  : "bg-[var(--usa-red)] text-white";
            return (
              <div key={s.n} className="card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-base font-black shadow-md ${badge}`}
                  >
                    {s.n}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
                    Step {s.n}
                  </div>
                </div>
                <div className="text-xl font-bold mb-2 text-emerald-950">{s.t}</div>
                <div className="text-sm text-emerald-950/70 leading-relaxed">{s.d}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
            Payouts · The pot scales with the pool
          </h2>
          <span className="text-xs text-emerald-900/40">
            {playerCount} {playerCount === 1 ? "player" : "players"} signed up · ${payouts.pot} pot
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
          <PayoutTierCard playerCount={playerCount} sampleCounts={[15, 25, 50]} />

          {playerCount > 0 && (
            <div className="card-gold rounded-2xl p-5 flex flex-col">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold">
                  If the pool closed right now
                </div>
                <div className="text-sm text-emerald-950/70 mt-0.5">
                  {playerCount} {playerCount === 1 ? "player" : "players"} × ${POOL_ENTRY.amount} = <strong className="text-emerald-950">${payouts.pot}</strong> pot
                </div>
              </div>
              <div className="flex gap-2 flex-wrap mt-auto pt-4">
                {payouts.amounts.map((amt, i) => (
                  <div key={i} className="flex-1 min-w-[80px] text-center px-4 py-2 rounded-lg bg-white/70 border border-amber-900/15">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-amber-900/70">
                      {PAYOUT.places[i]}
                    </div>
                    <div className="text-xl font-black text-gold">${amt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-emerald-900/60 mt-3 px-1">
          Pot is paid out only to players who have venmo&apos;d the buy-in to{" "}
          <strong className="text-emerald-950">@{POOL_ENTRY.venmoHandle}</strong> before kickoff of match #1.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
            Scoring · Every round raises the stakes
          </h2>
          <span className="text-xs text-emerald-900/40">200+ pts on the line</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ROUNDS.map((r) => (
            <div key={r.label} className="card rounded-2xl p-5 hover:border-emerald-700/30 transition">
              <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
                {r.label}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-black text-gold leading-none">{r.points}</span>
                <span className="text-xs text-emerald-900/50 font-medium">pts</span>
              </div>
              <div className="mt-2 text-xs text-emerald-900/50">
                {r.games} {r.games === 1 ? "match" : "matches"}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-emerald-900/60 mt-3 px-1">
          <strong className="text-emerald-950">Drawn group games</strong> earn{" "}
          <strong className="text-emerald-950">0.5 pts</strong> for picking either team — your
          team didn&apos;t lose.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card-pitch rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold">
                2026 only
              </div>
              <div className="text-lg font-bold mt-1 text-emerald-950">Best 3rd-place teams</div>
              <div className="text-xs text-emerald-900/60 mt-0.5">Pick 8 of 12 groups whose 3rd-placer advances</div>
            </div>
            <div className="text-3xl font-black text-pitch">+3</div>
          </div>
          <div className="card rounded-2xl p-5 flex items-center justify-between border-l-4 !border-l-emerald-600">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold">
                Knockout bonus
              </div>
              <div className="text-lg font-bold mt-1 text-emerald-950">3rd-place upset win</div>
              <div className="text-xs text-emerald-900/60 mt-0.5">Each knockout game you pick a 3rd-place team to win</div>
            </div>
            <div className="text-3xl font-black text-pitch">+5</div>
          </div>
          <div className="card-gold rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold">
                Bonus
              </div>
              <div className="text-lg font-bold mt-1 text-emerald-950">Golden Boot pick</div>
              <div className="text-xs text-amber-900/70 mt-0.5">Predict the tournament top scorer</div>
            </div>
            <div className="text-3xl font-black text-gold">+15</div>
          </div>
          <div className="card rounded-2xl p-5 flex items-center justify-between border-l-4 !border-l-[var(--usa-red)]">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-red-800 font-bold">
                Tiebreaker
              </div>
              <div className="text-lg font-bold mt-1 text-emerald-950">Total goals in the final</div>
              <div className="text-xs text-red-900/70 mt-0.5">Closest guess wins ties</div>
            </div>
            <div className="text-3xl">⚽</div>
          </div>
        </div>
      </section>

    </div>
  );
}

function PayoutTierCard({
  playerCount,
  sampleCounts,
}: {
  playerCount: number;
  sampleCounts: number[];
}) {
  return (
    <div className="card rounded-2xl p-5 ring-2 ring-emerald-700/50 shadow-lg shadow-emerald-700/10">
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
          Payout structure
        </div>
        <div className="text-lg font-bold text-emerald-950 mt-0.5">Top 3 pay</div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {PAYOUT.split.map((pct, i) => (
          <div key={i} className="flex-1 min-w-[80px] px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-900/10 text-center">
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-900/50">
              {PAYOUT.places[i]}
            </div>
            <div className="text-2xl font-black text-pitch leading-tight">
              {Math.round(pct * 100)}%
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-emerald-900/5 pt-3">
        <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-900/40 mb-2">
          Examples
        </div>
        <div className="space-y-1">
          {sampleCounts.map((count) => {
            const sample = {
              pot: count * POOL_ENTRY.amount,
              amounts: (() => {
                const split = PAYOUT.split;
                const rounded = split.map((pct) => Math.floor(count * POOL_ENTRY.amount * pct));
                const remainder = count * POOL_ENTRY.amount - rounded.reduce((a, b) => a + b, 0);
                rounded[0] += remainder;
                return rounded;
              })(),
            };
            return (
              <div
                key={count}
                className={`flex items-center justify-between text-xs ${
                  count === playerCount ? "font-bold text-emerald-950" : "text-emerald-950/60"
                }`}
              >
                <span className="tabular-nums">
                  {count}p · ${sample.pot}
                </span>
                <span className="tabular-nums font-mono">
                  {sample.amounts.map((a) => `$${a}`).join(" / ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
