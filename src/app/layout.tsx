import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WC26 — World Cup 2026 Bracket Pool",
  description: "Pick every match. Lift the trophy. Bragging rights on the line.",
};

function TrophyMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="goldgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <path
        d="M7 4h10v2.5a5 5 0 0 1-4 4.9V14h2.5a1.5 1.5 0 0 1 1.5 1.5V18H7v-2.5A1.5 1.5 0 0 1 8.5 14H11v-2.6A5 5 0 0 1 7 6.5V4Zm-3 1.5h3v3a3 3 0 0 1-3-3v0Zm13 0h3a3 3 0 0 1-3 3v-3ZM6 19h12v1.5H6V19Z"
        fill="url(#goldgrad)"
      />
    </svg>
  );
}

async function HeaderAuth() {
  // Auth header is best-effort — if Supabase isn't configured yet, show signed-out state.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return (
        <Link href="/login" className="ml-2 px-4 py-2 rounded-lg btn-gold text-sm">
          Sign In
        </Link>
      );
    }

    const display =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "you";

    return (
      <div className="flex items-center gap-2 ml-2">
        <span className="text-xs text-emerald-900/60 hidden sm:inline">
          Hi, <strong className="text-emerald-950">{display}</strong>
        </span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="px-3 py-2 rounded-lg text-sm font-semibold text-emerald-950/70 hover:text-emerald-950 hover:bg-emerald-50 transition"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  } catch {
    return (
      <Link href="/login" className="ml-2 px-4 py-2 rounded-lg btn-gold text-sm">
        Sign In
      </Link>
    );
  }
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <div className="stripe-usa h-[3px] w-full" />
        <header className="border-b border-emerald-900/10 sticky top-[3px] z-50 backdrop-blur-xl bg-[#fdfaf2]/85">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-900 border border-emerald-900/30 flex items-center justify-center shadow-lg shadow-emerald-900/15">
                <TrophyMark className="w-6 h-6" />
              </div>
              <div className="leading-tight">
                <div className="font-black tracking-tight text-emerald-950">WC26</div>
                <div className="text-[11px] tracking-widest text-emerald-800/60 uppercase font-semibold">
                  Bracket Pool
                </div>
              </div>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/picks"
                className="px-3 py-2 rounded-lg text-emerald-950/70 hover:text-emerald-950 hover:bg-emerald-50 transition font-medium"
              >
                My Picks
              </Link>
              <Link
                href="/leaderboard"
                className="px-3 py-2 rounded-lg text-emerald-950/70 hover:text-emerald-950 hover:bg-emerald-50 transition font-medium"
              >
                Leaderboard
              </Link>
              <HeaderAuth />
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-emerald-900/10 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-emerald-950/50 flex justify-between flex-wrap gap-2">
            <span>WC26 · Friends &amp; family bracket pool</span>
            <span>Tournament: June 11 – July 19, 2026 · 🇺🇸 🇨🇦 🇲🇽</span>
          </div>
          <div className="stripe-usa h-[3px] w-full" />
        </footer>
      </body>
    </html>
  );
}
