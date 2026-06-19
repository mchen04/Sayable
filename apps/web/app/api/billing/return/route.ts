import { type NextRequest } from "next/server";
import { requireHostSession } from "@/src/lib/host-auth";
import { getPremiumCheckoutReturn } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(request, "premium_return", { limit: 20, windowMs: 60_000 });
    const sessionId = request.nextUrl.searchParams.get("session_id") || "";
    if (!sessionId) {
      return json({ error: "Checkout session is missing." }, 400);
    }
    const session = await requireHostSession(request);
    const result = await getPremiumCheckoutReturn(sessionId, session.sub);
    return json(result);
  } catch (error) {
    return handleApiError(error, request);
  }
}
