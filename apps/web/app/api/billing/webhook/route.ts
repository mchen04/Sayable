import { type NextRequest } from "next/server";
import { handleBillingWebhook } from "@/src/lib/billing";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    // Stripe webhooks arrive from a small set of Stripe IPs and can legitimately
    // burst (event backlog, retries). Authenticity is enforced by the HMAC
    // signature check inside handleBillingWebhook, so keep only a high abuse cap
    // here to avoid throttling real deliveries.
    enforceRateLimit(request, "billing_webhook", { limit: 600, windowMs: 60_000 });
    const payload = await request.text();
    await handleBillingWebhook(payload, request.headers.get("stripe-signature"));
    return json({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
