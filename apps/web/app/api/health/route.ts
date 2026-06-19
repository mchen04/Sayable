import { json } from "@/src/lib/http";

export async function GET() {
  return json({
    ok: true,
    service: "sayable-web",
    stripeMode: process.env.STRIPE_MODE || "mock",
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  });
}
