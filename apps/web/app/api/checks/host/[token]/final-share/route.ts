import { type NextRequest } from "next/server";
import { markFinalShared, publicBaseUrl } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "final_share", { limit: 20, windowMs: 60_000 });
    const { token } = await params;
    const { finalMessage, resultToken } = await markFinalShared(token);
    return json({
      message: `${finalMessage} ${publicBaseUrl()}/r/${resultToken}`,
      resultUrl: `${publicBaseUrl()}/r/${resultToken}`
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
