import { type NextRequest } from "next/server";
import { requireHostSession } from "@/src/lib/host-auth";
import { markFinalSharedForOwner, publicBaseUrl } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

type RouteContext = { params: Promise<{ checkId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "dashboard_final_share", { limit: 20, windowMs: 60_000 });
    const session = await requireHostSession(request);
    const { checkId } = await params;
    const { finalMessage, resultToken } = await markFinalSharedForOwner(checkId, session.sub);
    return json({
      message: `${finalMessage} ${publicBaseUrl()}/r/${resultToken}`,
      resultUrl: `${publicBaseUrl()}/r/${resultToken}`
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
