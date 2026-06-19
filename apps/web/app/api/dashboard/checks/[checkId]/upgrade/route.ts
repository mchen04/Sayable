import { type NextRequest } from "next/server";
import { createPremiumCheckoutForCheck } from "@/src/lib/billing";
import { requireHostSession } from "@/src/lib/host-auth";
import { upgradeSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ checkId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "dashboard_premium_upgrade", { limit: 10, windowMs: 60_000 });
    const input = await parseJson(request, upgradeSchema);
    const session = await requireHostSession(request);
    const { checkId } = await params;
    const result = await createPremiumCheckoutForCheck(checkId, session.sub, session.actor, input.outcome || "success");
    return json(result);
  } catch (error) {
    return handleApiError(error, request);
  }
}
