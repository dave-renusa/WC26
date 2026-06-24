import { createClient } from "@/lib/supabase/server";
import { formatEtDeadline } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROUNDS: { label: string; pts: number; games: number }[] = [
  { label: "Group Stage", pts: 1, games: 72 },
  { label: "Round of 32", pts: 1, games: 16 },
  { label: "Round of 16", pts: 3, games: 8 },
  { label: "Quarterfinals", pts: 5, games: 4 },
  { label: "Semifinals", pts: 8, games: 2 },
  { label: "Final", pts: 13, games: 1 },
];

export default async function RulesPage() {
  // Bracket deadline derived from the real first-R32 kickoff (auto-corrects
  // when ESPN sets the time). Falls back to "TBD" if unavailable.
  let firstR32Kickoff: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("matches")
      .select("kickoff_at")
      .eq("stage", "r32")
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    firstR32Kickoff = (data?.kickoff_at as string | null) ?? null;
  } catch {
    /* fallback */
  }
  const bracketDeadline = formatEtDeadline(firstR32Kickoff, true);

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
          <div className="flex items-baseline justify-between px-5 py-3.5 bg-emerald-50/50">
            <div>
              <div className="font-semibold text-emerald-950">3rd-place upset win</div>
              <div className="text-xs text-emerald-950/50">
                Each knockout game you correctly pick a 3rd-place qualifier to win
              </div>
            </div>
            <div>
              <span className="text-3xl font-black text-pitch">5</span>
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
          Base max (every pick right): <strong className="text-emerald-950">200 pts</strong> —
          plus <strong className="text-emerald-950">+5</strong> for every knockout game a
          3rd-place qualifier you backed pulls off.
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
          Two pick windows
        </h2>
        <div className="card rounded-2xl p-6 space-y-3 text-sm text-emerald-950/80 leading-relaxed">
          <p>
            <strong>Window 1 — Group stage.</strong> Pick all 72 group matches, your 8 of 12
            third-place groups, and your Golden Boot. Everything locks at kickoff of the first
            group match — <strong>Thursday, June 11, 2026 at 3:00 PM ET</strong>.
          </p>
          <p>
            <strong>Window 2 — The bracket.</strong> Once group stage ends, your full
            knockout bracket opens: R32 (16), R16 (8), QF (4), SF (2), Final (1) — all 31 matches
            picked in one sitting. You have until kickoff of R32 match #1 —{" "}
            <strong>{bracketDeadline}</strong> — to fill out the entire bracket.
            No second chances after that — your bracket is your bracket.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Strict bracket
        </h2>
        <div className="card-pitch rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed space-y-3">
          <p>
            Your bracket cascades. Pick Brazil over Argentina in R32 → Brazil advances to your
            R16 slot. Pick Brazil to win R16 → they advance to your QF slot. And so on through
            the Final.
          </p>
          <p>
            <strong className="text-emerald-950">If a team you advanced loses earlier than you predicted, every later pick that involved
            that team scores 0.</strong> Pick Brazil to lift the trophy, but they go out in R32?
            Your R16 / QF / SF / Final picks for Brazil are all 0 because Brazil isn&apos;t in those
            matches. That&apos;s the whole point — the 13 points for the Final aren&apos;t a free
            ride; you have to predict the path.
          </p>
          <p>
            If you change an earlier pick, the picks page automatically clears any later picks
            that no longer fit your new bracket. You re-pick from your new path.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          3rd-place upset bonus
        </h2>
        <div className="card-pitch rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed space-y-3">
          <p>
            Eight of the twelve 3rd-place group finishers sneak into the Round of 32. They&apos;re
            the underdogs — so back one to win a knockout game and you bank an extra{" "}
            <strong className="text-emerald-950">+5 points</strong> on top of the round&apos;s
            points, <em>every</em> time it happens. Pick a 3rd-place team to win in R32 and again
            in R16? That&apos;s +5 each — it stacks all the way up.
          </p>
          <p>
            You don&apos;t flag anything — group finishes are figured out automatically from the
            final group tables, so the bonus just lands when your underdog delivers.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-900/60 mb-3">
          Tiebreaker
        </h2>
        <div className="card rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed">
          On the Final pick, you also predict the <strong>total goals in the Final</strong>. Ties
          resolve in favor of whoever is closest. Still tied? Split the bragging rights.
        </div>
      </section>
    </div>
  );
}
