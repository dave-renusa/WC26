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

  // The bracket is always visible. Cards are clickable only when an admin has
  // flipped bracket_picks_open on (and before the first-R32-kickoff lock).
  return (
    <BracketPicker
      userId={user.id}
      teams={(teams ?? []) as Team[]}
      knockoutMatches={knockouts}
      initialPicks={allPicks}
      initialFinalTotalGoals={(bonus?.predicted_final_total_goals as number | null) ?? null}
      bracketLockAt={(settings?.r32_lock_at as string | null) ?? null}
      picksOpen={(settings?.bracket_picks_open as boolean | undefined) ?? false}
    />
  );
}
