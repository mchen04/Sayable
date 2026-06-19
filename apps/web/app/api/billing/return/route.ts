import { type NextRequest } from "next/server";
import { requireHostSession } from "@/src/lib/host-auth";
import { resolvePremiumCheckoutReturn, StoreError, type PremiumCheckoutReturnStatus } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

function parseReturnStatus(status: string | null): PremiumCheckoutReturnStatus | undefined {
  if (!status) {
    return undefined;
  }
  if (status === "success" || status === "cancelled") {
    return status;
  }
  throw new StoreError(400, "Checkout return status is invalid.");
}

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(request, "premium_return", { limit: 20, windowMs: 60_000 });
    const sessionId = request.nextUrl.searchParams.get("session_id") || "";
    if (!sessionId) {
      return json({ error: "Checkout session is missing." }, 400);
    }
    const session = await requireHostSession(request);
    const result = await resolvePremiumCheckoutReturn(
      sessionId,
      session.sub,
      parseReturnStatus(request.nextUrl.searchParams.get("status")),
      session.actor
    );
    return json(result);
  } catch (error) {
    return handleApiError(error, request);
  }
}
