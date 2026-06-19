import { type NextRequest } from "next/server";
import { handleBillingWebhook } from "@/src/lib/billing";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "billing_webhook", { limit: 60, windowMs: 60_000 });
    const payload = await request.text();
    await handleBillingWebhook(payload, request.headers.get("stripe-signature"));
    return json({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
