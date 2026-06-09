import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

const LOCK_FIELDS = [
  "group_stage_lock_at",
  "third_place_lock_at",
  "golden_boot_lock_at",
  "r32_lock_at",
  "r16_lock_at",
  "qf_lock_at",
  "sf_lock_at",
  "final_lock_at",
] as const;

type LockField = (typeof LOCK_FIELDS)[number];

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = (await req.json()) as Partial<Record<LockField | "is_finalized", string | boolean | null>>;
  const update: Record<string, string | boolean | null> = {};
  for (const f of LOCK_FIELDS) {
    if (f in body) update[f] = (body[f] as string | null) || null;
  }
  if (typeof body.is_finalized === "boolean") update.is_finalized = body.is_finalized;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }
  const { error } = await ctx.service.from("tournament_settings").update(update).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
