"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Live countdown to the bracket lock (first R32 kickoff — Sun Jun 28, 3pm ET).
// `target` is an ISO timestamp so it auto-corrects if ESPN refines the kickoff;
// it falls back to the published 3pm ET lock if nothing is passed.
const FALLBACK_TARGET = "2026-06-28T19:00:00+00:00";

function diff(targetMs: number) {
  const total = Math.max(0, targetMs - Date.now());
  const sec = Math.floor(total / 1000);
  return {
    total,
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

export function Countdown({ target }: { target?: string | null }) {
  const targetMs = Date.parse(target ?? FALLBACK_TARGET) || Date.parse(FALLBACK_TARGET);

  // Start null so server and first client paint match; fill in after mount.
  const [t, setT] = useState<ReturnType<typeof diff> | null>(null);

  useEffect(() => {
    setT(diff(targetMs));
    const id = setInterval(() => setT(diff(targetMs)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const locked = t != null && t.total <= 0;

  const segments = [
    { label: "Days", value: t?.days },
    { label: "Hours", value: t?.hours },
    { label: "Mins", value: t?.minutes },
    { label: "Secs", value: t?.seconds },
  ];

  return (
    <div className="card-pitch rounded-2xl p-6 sm:p-8 text-center">
      <div className="text-[10px] uppercase tracking-widest text-emerald-800 font-bold mb-3">
        {locked ? "It's tight at the top" : "Bracket picks lock in"}
      </div>

      {locked ? (
        <div className="py-3">
          <div className="text-3xl sm:text-4xl font-black text-emerald-950">
            ⚽ How we break a tie
          </div>
          <p className="mt-2 text-sm text-emerald-900/60 max-w-md mx-auto">
            If two or more players finish level on points, we settle it by your
            Final goals guess first, then most correct picks.
          </p>
          <Link
            href="/rules"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950 transition"
          >
            See the full tiebreaker order →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-3 sm:gap-4">
            {segments.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <div className="bg-white rounded-xl shadow-sm border border-emerald-900/10 w-16 sm:w-20 py-3">
                  <span className="block text-3xl sm:text-4xl font-black tabular-nums text-emerald-950 leading-none">
                    {s.value == null ? "--" : String(s.value).padStart(2, "0")}
                  </span>
                </div>
                <span className="mt-1.5 text-[10px] uppercase tracking-widest text-emerald-900/50 font-bold">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-emerald-900/60 font-medium">
            Round of 32 starts <strong className="text-emerald-950">Sun, June 28 · 3:00 PM ET</strong>
          </p>
        </>
      )}
    </div>
  );
}
