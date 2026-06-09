import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/picks";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Guarantee a profile row exists before redirecting onward, so the first
  // pick/3rd-place/bonus insert never trips the FK constraint.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
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
  }

  return NextResponse.redirect(`${origin}${next}`);
}
