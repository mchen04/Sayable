import { json } from "@/src/lib/http";

export async function GET() {
  const storeBackend = process.env.SAYABLE_STORE_BACKEND || "file";
  const supabasePublicConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const supabaseStoreConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      (process.env.SAYABLE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      process.env.SAYABLE_TOKEN_ENCRYPTION_KEY
  );

  return json({
    ok: true,
    service: "sayable-web",
    stripeMode: process.env.STRIPE_MODE || "mock",
    storeBackend,
    supabaseConfigured: supabasePublicConfigured,
    supabaseStoreConfigured
  });
}
