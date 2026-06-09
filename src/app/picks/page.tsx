import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PicksForm } from "./picks-form";
import type { Team, Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/picks");

  // Defense in depth: if the on_auth_user_created trigger missed this user
  // (e.g. it didn't exist yet at signup time), backfill the profile so
  // picks/third_place_picks/bonus_picks FK inserts don't fail later.
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
    { data: matches },
    { data: picks },
    { data: thirdPlace },
    { data: bonus },
    { data: settings },
  ] = await Promise.all([
    supabase.from("teams").select("*").order("group_code").order("slot"),
    supabase
      .from("matches")
      .select("*")
      .eq("stage", "group")
      .order("kickoff_at"),
    supabase.from("picks").select("*").eq("user_id", user.id),
    supabase.from("third_place_picks").select("group_code").eq("user_id", user.id),
    supabase.from("bonus_picks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_settings").select("*").eq("id", 1).single(),
  ]);

  return (
    <PicksForm
      userId={user.id}
      teams={(teams ?? []) as Team[]}
      matches={(matches ?? []) as Match[]}
      initialPicks={
        Object.fromEntries(
          (picks ?? []).map((p) => [p.match_id as number, p.predicted_winner_team_id as number]),
        ) as Record<number, number>
      }
      initialThirdPlace={(thirdPlace ?? []).map((r) => r.group_code as string)}
      initialGoldenBoot={(bonus?.golden_boot_player as string | null) ?? ""}
      groupStageLockAt={(settings?.group_stage_lock_at as string | null) ?? null}
    />
  );
}
