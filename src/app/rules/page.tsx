const ROUNDS: { label: string; pts: number; games: number }[] = [
  { label: "Group Stage", pts: 1, games: 72 },
  { label: "Round of 32", pts: 2, games: 16 },
  { label: "Round of 16", pts: 3, games: 8 },
  { label: "Quarterfinals", pts: 5, games: 4 },
  { label: "Semifinals", pts: 8, games: 2 },
  { label: "Final", pts: 13, games: 1 },
];

export default function RulesPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 w-full">
      <h1 className="text-4xl font-black tracking-tighter text-emerald-950 mb-3">
        How to win the pool
      </h1>
      <p className="text-emerald-950/70 mb-10 leading-relaxed">
        Pick every match. Earn points. Climb the leaderboard. Lift the trophy of bragging rights.
      </p>

      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Scoring
        </h2>
        <div className="card rounded-2xl divide-y divide-emerald-900/10">
          {ROUNDS.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between px-5 py-3.5">
              <div>
                <div className="font-semibold text-emerald-950">{r.label}</div>
                <div className="text-xs text-emerald-950/50">
                  {r.games} {r.games === 1 ? "match" : "matches"}
                </div>
              </div>
              <div>
                <span className="text-3xl font-black text-gold">{r.pts}</span>
                <span className="text-xs text-emerald-950/50 ml-1">pts each</span>
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between px-5 py-3.5 bg-emerald-50/50">
            <div>
              <div className="font-semibold text-emerald-950">
                Best 3rd-place teams <span className="text-xs font-normal text-emerald-700">(2026 only)</span>
              </div>
              <div className="text-xs text-emerald-950/50">Pick 8 of 12 groups whose 3rd-placer advances</div>
            </div>
            <div>
              <span className="text-3xl font-black text-pitch">3</span>
              <span className="text-xs text-emerald-950/50 ml-1">pts each</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between px-5 py-3.5 bg-amber-50/50">
            <div>
              <div className="font-semibold text-emerald-950">Golden Boot bonus</div>
              <div className="text-xs text-emerald-950/50">Predict the tournament top scorer</div>
            </div>
            <div>
              <span className="text-3xl font-black text-gold">15</span>
              <span className="text-xs text-emerald-950/50 ml-1">pts</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-emerald-950/50 mt-3">
          Max possible score: <strong className="text-emerald-950">216 pts</strong>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Draws in the group stage
        </h2>
        <div className="card-pitch rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed">
          Plenty of group matches end level. If a group game finishes drawn, you
          earn <strong className="text-emerald-950">0.5 pts</strong> for picking either team
          (your team didn&apos;t lose). Picking the actual winner is still worth the full
          1 pt. Knockout matches can&apos;t draw — penalty shootouts produce a winner.
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          How locking works
        </h2>
        <div className="card rounded-2xl p-6 space-y-3 text-sm text-emerald-950/80 leading-relaxed">
          <p>
            <strong>Group stage + Golden Boot + 3rd-place picks</strong> lock at kickoff of the first
            group match on <strong>June 11, 2026</strong>. After that, no edits.
          </p>
          <p>
            <strong>Each knockout round</strong> reveals once the prior round is decided, and locks at
            kickoff of the first match of that round. So even if you wreck the group stage, you can
            re-enter the next round fresh.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Tiebreaker
        </h2>
        <div className="card rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed">
          On the final pick, you also predict the <strong>total goals in the Final</strong>. Ties
          resolve in favor of whoever is closest. Still tied? Split the bragging rights.
        </div>
      </section>
    </div>
  );
}
