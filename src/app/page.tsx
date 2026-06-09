import Link from "next/link";

const POOL_ENTRY = {
  amount: 25,
  venmoHandle: "David-DOnofrio-03",
};

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

export default function Home() {
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

      <section className="max-w-7xl mx-auto px-6 pb-24 w-full">
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
    </div>
  );
}
