import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PicksForm } from "./picks-form";
import { BracketPicker } from "./bracket-picker";
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
    { data: groupMatches },
    { data: knockoutMatches },
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
    supabase
      .from("matches")
      .select("*")
      .neq("stage", "group")
      .order("stage")
      .order("bracket_slot"),
    supabase.from("picks").select("*").eq("user_id", user.id),
    supabase.from("third_place_picks").select("group_code").eq("user_id", user.id),
    supabase.from("bonus_picks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_settings").select("*").eq("id", 1).single(),
  ]);

  const allPicks = Object.fromEntries(
    (picks ?? []).map((p) => [p.match_id as number, p.predicted_winner_team_id as number]),
  ) as Record<number, number>;

  const groupMatchList = (groupMatches ?? []) as Match[];

  // 3rd-place and Golden Boot picks lock at the tournament's first kickoff.
  // Derive it from the actual match data (rather than a settings column that
  // may never have been populated) so the lock is always correct.
  const firstKickoff = groupMatchList
    .map((m) => m.kickoff_at)
    .filter((k): k is string => !!k)
    .reduce<string | null>(
      (min, k) =>
        min == null || new Date(k).getTime() < new Date(min).getTime() ? k : min,
      null,
    );

  const knockouts = (knockoutMatches ?? []) as Match[];
  // Bracket is "ready" when at least one R32 match has both teams populated.
  // Admin's "Open bracket" action triggers the populate, so this also acts as
  // a flag for whether players should see the bracket section.
  const bracketReady = knockouts.some(
    (m) => m.stage === "r32" && m.team_a_id != null && m.team_b_id != null,
  );

  return (
    <>
      <PicksForm
        userId={user.id}
        teams={(teams ?? []) as Team[]}
        matches={groupMatchList}
        initialPicks={allPicks}
        initialThirdPlace={(thirdPlace ?? []).map((r) => r.group_code as string)}
        initialGoldenBoot={(bonus?.golden_boot_player as string | null) ?? ""}
        bonusLockAt={firstKickoff}
      />
      {bracketReady && (
        <BracketPicker
          userId={user.id}
          teams={(teams ?? []) as Team[]}
          knockoutMatches={knockouts}
          initialPicks={allPicks}
          bracketLockAt={(settings?.r32_lock_at as string | null) ?? null}
        />
      )}
    </>
  );
}
