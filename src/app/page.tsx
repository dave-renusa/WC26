import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const POOL_ENTRY = {
  amount: 25,
  venmoHandle: "David-DOnofrio-03",
};

// Payout structure
//   1–10 players → top 2 at 70/30
//   11+ players  → top 3 at 60/25/15
// Tier breakpoint at 11 keeps the cliff at 10→11 to ~$10 — basically symbolic.
const PAYOUT_TIERS = {
  small: { label: "1–10 players", split: [0.7, 0.3], places: ["1st", "2nd"] as const },
  large: { label: "11+ players", split: [0.6, 0.25, 0.15], places: ["1st", "2nd", "3rd"] as const },
};

function computePayouts(playerCount: number): {
  pot: number;
  tier: keyof typeof PAYOUT_TIERS;
  amounts: number[];
} {
  const pot = playerCount * POOL_ENTRY.amount;
  const tier: keyof typeof PAYOUT_TIERS = playerCount >= 11 ? "large" : "small";
  const split = PAYOUT_TIERS[tier].split;
  // Floor each payout to whole dollars; the remainder rolls to 1st place so
  // the math always sums exactly to the pot — no orphan pennies.
  const rounded = split.map((pct) => Math.floor(pot * pct));
  const remainder = pot - rounded.reduce((a, b) => a + b, 0);
  rounded[0] += remainder;
  return { pot, tier, amounts: rounded };
}

const ROUNDS = [
  { label: "Group Stage", points: 1, games: 72 },
  { label: "Round of 32", points: 2, games: 16 },
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

// Six pick windows across the tournament. lockBy is the first kickoff of that
// round (UTC) — picks for the round freeze at that moment. Dates straight from
// the FIFA 2026 published schedule.
const PICK_WINDOWS = [
  { id: "group", label: "Groups",      matches: 72, lockBy: "2026-06-11", lockLabel: "Jun 11" },
  { id: "r32",   label: "R32",         matches: 16, lockBy: "2026-06-28", lockLabel: "Jun 28" },
  { id: "r16",   label: "R16",         matches:  8, lockBy: "2026-07-04", lockLabel: "Jul 4"  },
  { id: "qf",    label: "Quarterfinals", matches: 4, lockBy: "2026-07-09", lockLabel: "Jul 9"  },
  { id: "sf",    label: "Semifinals",  matches:  2, lockBy: "2026-07-14", lockLabel: "Jul 14" },
  { id: "final", label: "Final",       matches:  1, lockBy: "2026-07-19", lockLabel: "Jul 19" },
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

        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.95] max-w-4xl">
          <span className="block text-emerald-950">Pick every match.</span>
          <span className="block text-gold">Lift the trophy.</span>
        </h1>

        <p className="mt-6 text-lg text-emerald-950/70 max-w-2xl leading-relaxed">
          The 2026 World Cup bracket pool for people who actually watch every group game.
          Pick round by round — blow one round, win the next.
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
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
            Six pick windows · Bracket unlocks as the tournament resolves
          </h2>
          <span className="text-xs text-emerald-900/40">
            You&apos;ll come back {PICK_WINDOWS.length - 1} more times after groups
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {PICK_WINDOWS.map((w, i) => {
            const isCurrent = w.id === currentWindowId;
            const isPast =
              currentWindowId === null ||
              PICK_WINDOWS.findIndex((x) => x.id === currentWindowId) > i;
            return (
              <div
                key={w.id}
                className={`relative rounded-2xl p-4 transition ${
                  isCurrent
                    ? "card-gold ring-2 ring-amber-500/40"
                    : isPast
                      ? "card opacity-50"
                      : "card"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
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
                <div className="text-sm font-black text-emerald-950 leading-tight">
                  {w.label}
                </div>
                <div className="text-[11px] text-emerald-900/60 mt-0.5">
                  {w.matches} {w.matches === 1 ? "match" : "matches"}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-900/40 font-bold mt-2">
                  Pick by {w.lockLabel}
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
              t: "Come back each round",
              d: "Bracket reveals as FIFA seeds it. Pick R32, R16, QF, SF, Final.",
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
          <PayoutTierCard
            tierKey="small"
            playerCount={playerCount}
            sampleCounts={[5, 8, 10]}
            isActive={payouts.tier === "small"}
          />
          <PayoutTierCard
            tierKey="large"
            playerCount={playerCount}
            sampleCounts={[15, 25, 50]}
            isActive={payouts.tier === "large"}
          />
        </div>

        {playerCount > 0 && (
          <div className="mt-3 card-gold rounded-2xl p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-800 font-bold">
                If the pool closed right now
              </div>
              <div className="text-sm text-emerald-950/70 mt-0.5">
                {playerCount} {playerCount === 1 ? "player" : "players"} × ${POOL_ENTRY.amount} = <strong className="text-emerald-950">${payouts.pot}</strong> pot
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {payouts.amounts.map((amt, i) => (
                <div key={i} className="text-center px-4 py-2 rounded-lg bg-white/70 border border-amber-900/15">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-amber-900/70">
                    {PAYOUT_TIERS[payouts.tier].places[i]}
                  </div>
                  <div className="text-xl font-black text-gold">${amt}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-emerald-900/60 mt-3 px-1">
          Tiers switch at 11 players. Pot is paid out only to players who have venmo&apos;d the buy-in to{" "}
          <strong className="text-emerald-950">@{POOL_ENTRY.venmoHandle}</strong> before kickoff of match #1.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60">
            Scoring · Every round raises the stakes
          </h2>
          <span className="text-xs text-emerald-900/40">216 pts max</span>
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
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
  tierKey,
  playerCount,
  sampleCounts,
  isActive,
}: {
  tierKey: keyof typeof PAYOUT_TIERS;
  playerCount: number;
  sampleCounts: number[];
  isActive: boolean;
}) {
  const tier = PAYOUT_TIERS[tierKey];
  return (
    <div
      className={`card rounded-2xl p-5 ${
        isActive ? "ring-2 ring-emerald-700/50 shadow-lg shadow-emerald-700/10" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
            {tier.label}
          </div>
          <div className="text-lg font-bold text-emerald-950 mt-0.5">
            {tier.places.length === 2 ? "Top 2 pay" : "Top 3 pay"}
          </div>
        </div>
        {isActive && (
          <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-emerald-700 text-white">
            Current tier
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {tier.split.map((pct, i) => (
          <div key={i} className="flex-1 min-w-[80px] px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-900/10 text-center">
            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-900/50">
              {tier.places[i]}
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
                const split = tier.split;
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
