import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AdminContext {
  userId: string;
  service: SupabaseClient;
}

export async function requireAdmin(): Promise<AdminContext | { error: string; status: number }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return { error: "forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "service-role-not-configured", status: 500 };

  const service = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userId: user.id, service };
}
