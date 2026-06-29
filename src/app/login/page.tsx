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

// Turn a raw callback error (?error=...) into a friendly, actionable message.
function friendlyAuthError(code: string): string {
  const c = code.toLowerCase();
  if (code === "missing_code") {
    return "That sign-in link was incomplete or had already been used. Request a fresh magic link below.";
  }
  if (c.includes("expired")) {
    return "That magic link has expired or was already used. Magic links are single-use — request a fresh one below and click it right away.";
  }
  if (c.includes("code verifier") || c.includes("pkce") || c.includes("invalid request") || c.includes("flow state")) {
    return "It looks like the link was opened in a different browser or device than the one that requested it. Request a new link below, and open it in the same browser you asked for it from.";
  }
  return "Something went wrong finishing sign-in. Request a fresh magic link below and open it in the same browser you requested it from.";
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/picks";
  const urlError = searchParams.get("error");

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

        {urlError && status !== "sent" && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-bold text-red-900 mb-1">Couldn&apos;t finish signing you in</h2>
            <p className="text-sm text-red-800">{friendlyAuthError(urlError)}</p>
            {urlError !== "missing_code" && (
              <p className="text-[11px] text-red-700/60 mt-2 break-words">Details: {urlError}</p>
            )}
          </div>
        )}

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
