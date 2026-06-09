import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

interface Body {
  match_id: number;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: number | null;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = (await req.json()) as Partial<Body>;
  if (typeof body.match_id !== "number") {
    return NextResponse.json({ error: "match_id required" }, { status: 400 });
  }
  const { error } = await ctx.service
    .from("matches")
    .update({
      score_a: body.score_a ?? null,
      score_b: body.score_b ?? null,
      winner_team_id: body.winner_team_id ?? null,
    })
    .eq("id", body.match_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
