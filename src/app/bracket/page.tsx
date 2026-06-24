import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BracketPicker } from "../picks/bracket-picker";
import type { Team, Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bracket");

  // Defense in depth: backfill the profile so knockout pick/bonus inserts
  // never fail on a missing FK (same guard the picks page uses).
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email!,
      display_name:
        (user.user_metadata?.display_name as string | undefined) ??
        user.email!.split("@")[0],
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  const [
    { data: teams },
    { data: knockoutMatches },
    { data: picks },
    { data: bonus },
    { data: settings },
  ] = await Promise.all([
    supabase.from("teams").select("*").order("group_code").order("slot"),
    supabase
      .from("matches")
      .select("*")
      .neq("stage", "group")
      .order("stage")
      .order("bracket_slot"),
    supabase.from("picks").select("*").eq("user_id", user.id),
    supabase.from("bonus_picks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_settings").select("*").eq("id", 1).single(),
  ]);

  const allPicks = Object.fromEntries(
    (picks ?? []).map((p) => [p.match_id as number, p.predicted_winner_team_id as number]),
  ) as Record<number, number>;

  const knockouts = (knockoutMatches ?? []) as Match[];
  // The bracket only has real matchups once the R32 teams are populated (after
  // the group stage). Until then, show a friendly "coming soon" instead of a
  // grid of empty cards.
  const bracketReady = knockouts.some(
    (m) => m.stage === "r32" && m.team_a_id != null && m.team_b_id != null,
  );

  if (!bracketReady) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 w-full">
        <h1 className="text-4xl font-black tracking-tighter text-emerald-950">Your bracket</h1>
        <div className="mt-6 card-pitch rounded-2xl p-6 text-emerald-950/80 leading-relaxed">
          <p className="font-bold text-emerald-950 mb-1">
            The knockout bracket opens once the group stage ends.
          </p>
          <p className="text-sm">
            The 16 Round-of-32 matchups are set after the final group games. As soon as
            they&apos;re in, your full bracket — R32 through the Final, all 31 matches — appears
            here to fill out in one sitting. Everything locks at the first R32 kickoff:{" "}
            <strong>Sunday, June 28 · 12:00 PM ET</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BracketPicker
      userId={user.id}
      teams={(teams ?? []) as Team[]}
      knockoutMatches={knockouts}
      initialPicks={allPicks}
      initialFinalTotalGoals={(bonus?.predicted_final_total_goals as number | null) ?? null}
      bracketLockAt={(settings?.r32_lock_at as string | null) ?? null}
    />
  );
}
