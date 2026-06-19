import { type NextRequest } from "next/server";
import { verifyDemoToken } from "@/src/lib/demo-auth";
import { createCheck, hashToken, logAnalytics, publicBaseUrl, serializeHostCheck } from "@/src/lib/store";
import { createCheckSchema } from "@/src/lib/schemas";
import { enforceRateLimit, fingerprintHash, handleApiError, json, parseJson } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "create_check", { limit: 12, windowMs: 60_000 });
    const input = await parseJson(request, createCheckSchema);
    const authorization = request.headers.get("authorization") || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const ownerUserId = bearer ? verifyDemoToken(bearer).sub : undefined;
    logAnalytics("create_flow_started", { activityType: input.activityType });
    const createdByHash = ownerUserId ? undefined : input.creatorNonce ? hashToken(input.creatorNonce) : fingerprintHash(request);
    const { check, guestToken, hostToken } = await createCheck(input, createdByHash, ownerUserId);
    logAnalytics("auto_draft_generated", { activityType: input.activityType }, check.id);
    return json(
      {
        check: serializeHostCheck(check),
        guestToken,
        hostToken,
        guestUrl: `${publicBaseUrl()}/c/${guestToken}`,
        hostUrl: `${publicBaseUrl()}/checks/${hostToken}/review`,
        resultsUrl: `${publicBaseUrl()}/h/${hostToken}`
      },
      201
    );
  } catch (error) {
    return handleApiError(error, request);
  }
}
