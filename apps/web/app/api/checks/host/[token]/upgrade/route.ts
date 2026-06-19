import { type NextRequest } from "next/server";
import { createPremiumCheckout } from "@/src/lib/billing";
import { requireHostSession } from "@/src/lib/host-auth";
import { getHostCheckForApi, logAnalytics } from "@/src/lib/store";
import { upgradeSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "premium_mock_upgrade", { limit: 10, windowMs: 60_000 });
    const input = await parseJson(request, upgradeSchema);
    const session = await requireHostSession(request);
    logAnalytics("premium_mock_checkout_started", {});
    const { token } = await params;
    const hostData = await getHostCheckForApi(token);
    const result = await createPremiumCheckout(
      token,
      session.sub,
      session.actor,
      input.outcome || "success",
      hostData.check.id,
      hostData.check.title
    );
    return json(result);
  } catch (error) {
    return handleApiError(error, request);
  }
}
