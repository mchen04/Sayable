import { type NextRequest } from "next/server";
import { optionalHostSession } from "@/src/lib/host-auth";
import { createCheck, hashToken, logAnalytics, publicBaseUrl, serializeHostCheck } from "@/src/lib/store";
import { createCheckSchema } from "@/src/lib/schemas";
import { enforceRateLimit, fingerprintHash, handleApiError, json, parseJson } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "create_check", { limit: 12, windowMs: 60_000 });
    const input = await parseJson(request, createCheckSchema);
    const session = await optionalHostSession(request);
    const ownerUserId = session?.sub;
    logAnalytics("create_flow_started", { activityType: input.activityType });
    const anonymousIdentity = ownerUserId
      ? undefined
      : {
          fingerprintHash: fingerprintHash(request),
          ...(input.creatorNonce ? { creatorNonceHash: hashToken(input.creatorNonce) } : {})
        };
    const { check, guestToken, hostToken } = await createCheck(
      input,
      anonymousIdentity,
      session ? { ownerUserId: session.sub, actor: session.actor, mode: session.mode } : undefined
    );
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
