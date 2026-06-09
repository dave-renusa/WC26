"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/picks";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: { display_name: displayName.trim() || email.split("@")[0] },
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-black tracking-tighter text-emerald-950 mb-2">
          Welcome to the pool.
        </h1>
        <p className="text-emerald-950/60 mb-8">
          Drop your email and we&apos;ll send a magic link. No passwords.
        </p>

        {status === "sent" ? (
          <div className="card-pitch rounded-2xl p-6">
            <div className="text-2xl mb-2">📬</div>
            <h2 className="text-xl font-bold text-emerald-950 mb-1">Check your inbox</h2>
            <p className="text-emerald-950/70 text-sm">
              We sent a magic link to <strong>{email}</strong>. Click it to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card rounded-2xl p-6 space-y-4">
            <div>
              <label htmlFor="display-name" className="block text-sm font-semibold text-emerald-950 mb-1.5">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full px-3 py-2.5 rounded-lg border border-emerald-900/15 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 text-emerald-950"
              />
              <p className="text-xs text-emerald-950/40 mt-1">
                Shown on the leaderboard. Defaults to the part before @ in your email.
              </p>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-emerald-950 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-emerald-900/15 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/40 focus:border-emerald-600 text-emerald-950"
              />
            </div>
            {error && (
              <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full px-4 py-3 rounded-xl btn-gold text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "Sending…" : "Send magic link →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
