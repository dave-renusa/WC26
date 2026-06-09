import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

interface Body {
  group_code: string;
  advanced: boolean;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = (await req.json()) as Partial<Body>;
  if (typeof body.group_code !== "string" || typeof body.advanced !== "boolean") {
    return NextResponse.json({ error: "group_code + advanced required" }, { status: 400 });
  }
  const { error } = await ctx.service
    .from("group_third_place_results")
    .upsert(
      { group_code: body.group_code, advanced: body.advanced },
      { onConflict: "group_code" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
