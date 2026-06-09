// POST /api/admin/open-bracket
//
// One-click action to open the knockout bracket for picks:
//   1. Run the ESPN sync against a window covering the R32 start dates. Since
//      the resolver now supports populate mode, this fills in team_a_id and
//      team_b_id (and updates kickoff_at) for any R32 row ESPN reports.
//   2. Read the earliest R32 kickoff (now that ESPN may have refined it) and
//      set all knockout lock times (r32/r16/qf/sf/final) to that moment. The
//      whole bracket locks together — players pick once before R32 #1
//      kickoff, and it freezes from then on.
//
// Idempotent: re-running after R32 teams are populated is a no-op on the
// match rows (resolver hits the strict path now that teams exist) and just
// rewrites the same lock times.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { runSync } from "@/lib/sync/sync-matches";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  // Window: 2 days before scheduled R32 start through 5 days after, so ESPN
  // has all the events available for matching.
  const start = new Date("2026-06-26T00:00:00Z");
  const end = new Date("2026-07-05T00:00:00Z");

  const report = await runSync({ start, end, dryRun: false });

  // Pull the earliest R32 kickoff — ESPN may have refined it from our seed
  // approximation. Falls back to seed default if no R32 rows came back.
  const { data: r32Min } = await ctx.service
    .from("matches")
    .select("kickoff_at")
    .eq("stage", "r32")
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .single();

  const lockAt = r32Min?.kickoff_at ?? "2026-06-28T16:00:00+00:00";

  const { error: settingsErr } = await ctx.service
    .from("tournament_settings")
    .update({
      r32_lock_at: lockAt,
      r16_lock_at: lockAt,
      qf_lock_at: lockAt,
      sf_lock_at: lockAt,
      final_lock_at: lockAt,
    })
    .eq("id", 1);

  return NextResponse.json({
    lockAt,
    settingsError: settingsErr?.message ?? null,
    syncReport: report,
  });
}
