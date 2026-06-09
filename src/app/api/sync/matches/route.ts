// POST /api/sync/matches
//
// Auth (any one is sufficient):
//   - Header  Authorization: Bearer <CRON_SECRET>   (Vercel cron sends this automatically)
//   - Header  x-sync-secret: <CRON_SECRET>          (curl / external callers)
//   - Cookie session for a profile with is_admin=true (admin page button)
//
// Query params:
//   apply=1   write changes (default is dry-run)
//   start=YYYY-MM-DD   defaults to today - 2 days (UTC)
//   end=YYYY-MM-DD     defaults to today + 1 day  (UTC)
//
// Response: SyncReport JSON.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSync } from "@/lib/sync/sync-matches";

export const dynamic = "force-dynamic";

function parseYmd(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fallback;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

async function isAuthorized(req: NextRequest): Promise<{ ok: boolean; via: string }> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Vercel cron attaches Authorization: Bearer <CRON_SECRET> automatically
    // when the project has the CRON_SECRET env var set.
    const bearer = req.headers.get("authorization");
    if (bearer && bearer === `Bearer ${secret}`) return { ok: true, via: "vercel-cron" };

    const provided = req.headers.get("x-sync-secret");
    if (provided && provided === secret) return { ok: true, via: "secret" };
  }

  // Fall back to authenticated admin user.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, via: "" };
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (profile?.is_admin) return { ok: true, via: "admin-session" };
  } catch {
    /* fall through */
  }
  return { ok: false, via: "" };
}

export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const apply = params.get("apply") === "1";
  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = parseYmd(params.get("start"), defaultStart);
  const end = parseYmd(params.get("end"), defaultEnd);

  try {
    const report = await runSync({ start, end, dryRun: !apply });
    return NextResponse.json({ via: auth.via, ...report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
