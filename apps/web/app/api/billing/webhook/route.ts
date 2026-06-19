import { type NextRequest } from "next/server";
import { handleBillingWebhook } from "@/src/lib/billing";
import { handleApiError, json } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    await handleBillingWebhook(payload, request.headers.get("stripe-signature"));
    return json({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
