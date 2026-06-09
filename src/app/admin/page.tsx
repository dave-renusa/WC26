import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminConsole } from "./admin-console";
import type { Match, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface SyncLogRow {
  id: number;
  match_id: number | null;
  source: string;
  status: string;
  reason: string | null;
  proposed_score_a: number | null;
  proposed_score_b: number | null;
  proposed_winner_id: number | null;
  prior_score_a: number | null;
  prior_score_b: number | null;
  prior_winner_id: number | null;
  dry_run: boolean;
  at: string;
}

export interface ThirdPlaceResultRow {
  group_code: string;
  advanced: boolean;
}

export interface TournamentSettings {
  group_stage_lock_at: string | null;
  third_place_lock_at: string | null;
  golden_boot_lock_at: string | null;
  r32_lock_at: string | null;
  r16_lock_at: string | null;
  qf_lock_at: string | null;
  sf_lock_at: string | null;
  final_lock_at: string | null;
  golden_boot_winner: string | null;
  is_finalized: boolean;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, display_name")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-black text-emerald-950">Admin</h1>
        <div className="mt-6 card rounded-2xl p-6 text-emerald-950/70">
          You don&apos;t have admin access. Ping the pool admin to promote your account
          via <code className="bg-emerald-50 px-1 py-0.5 rounded">profiles.is_admin</code>.
        </div>
      </div>
    );
  }

  const [{ data: teams }, { data: matches }, { data: settings }, { data: results }, { data: log }] =
    await Promise.all([
      supabase.from("teams").select("*").order("group_code").order("slot"),
      supabase.from("matches").select("*").order("kickoff_at"),
      supabase.from("tournament_settings").select("*").eq("id", 1).single(),
      supabase.from("group_third_place_results").select("*"),
      supabase.from("match_sync_log").select("*").order("at", { ascending: false }).limit(50),
    ]);

  return (
    <AdminConsole
      teams={(teams ?? []) as Team[]}
      matches={(matches ?? []) as Match[]}
      settings={(settings ?? null) as TournamentSettings | null}
      thirdPlaceResults={(results ?? []) as ThirdPlaceResultRow[]}
      recentSyncLog={(log ?? []) as SyncLogRow[]}
    />
  );
}
