// Shared tiebreaker ladder — rendered on both the home page and the rules page
// so the copy stays in one place. Pure presentational; safe in server components.

const TIEBREAKERS: { t: string; d: string }[] = [
  {
    t: "Closest to the total goals in the Final.",
    d: "Your bracket included a guess for the total goals scored in the Final. Closest guess wins. (No bracket, no guess — you'll lose this step to anyone who has one.)",
  },
  {
    t: "Most correct picks.",
    d: "Every match and every 3rd-place call you got right, counted once each.",
  },
  {
    t: "Round-by-round countback.",
    d: "Most points in the group stage. Still level? Then the Round of 32, then the Round of 16, quarterfinals, semifinals, and the Final — whoever pulls ahead first wins.",
  },
  {
    t: "Head-to-head.",
    d: "We look only at the games the tied players didn't all pick the same way. Whoever got the most of those right wins.",
  },
  {
    t: "Still dead even?",
    d: "Co-champions. Share the trophy, split the pot.",
  },
];

export function TiebreakerLadder() {
  return (
    <div className="card rounded-2xl p-6 text-sm text-emerald-950/80 leading-relaxed">
      <p className="mb-4">
        If two or more players finish with the same total points, we break it in
        this order — we keep moving down the list until someone comes out ahead.
      </p>
      <ol className="space-y-3">
        {TIEBREAKERS.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-black flex items-center justify-center">
              {i + 1}
            </span>
            <span>
              <strong className="text-emerald-950">{s.t}</strong> {s.d}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-emerald-950/50 italic">
        Realistically, most ties never get past step 1 or 2 — the rest are just
        there so we always have a fair answer, no matter how many players are level.
      </p>
    </div>
  );
}
