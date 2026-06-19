import { type NextRequest } from "next/server";
import { requireDemoSession } from "@/src/lib/demo-auth";
import { upgradeCheck, logAnalytics } from "@/src/lib/store";
import { upgradeSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "premium_mock_upgrade", { limit: 10, windowMs: 60_000 });
    const input = await parseJson(request, upgradeSchema);
    const session = requireDemoSession(request);
    logAnalytics("premium_mock_checkout_started", {});
    const { token } = await params;
    const purchase = await upgradeCheck(token, input.outcome || "success", session.sub);
    return json({ purchase });
  } catch (error) {
    return handleApiError(error, request);
  }
}
