import { type NextRequest } from "next/server";
import { getHostCheckForApi, markFinalShared, publicBaseUrl } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "final_share", { limit: 20, windowMs: 60_000 });
    const { token } = await params;
    const before = await getHostCheckForApi(token);
    const { resultToken } = await markFinalShared(token);
    return json({
      message: `${before.result.finalMessage} ${publicBaseUrl()}/r/${resultToken}`,
      resultUrl: `${publicBaseUrl()}/r/${resultToken}`
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
