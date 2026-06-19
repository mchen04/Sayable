import { type NextRequest } from "next/server";
import { logAnalytics } from "@/src/lib/store";
import { analyticsSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "analytics", { limit: 120, windowMs: 60_000 });
    const input = await parseJson(request, analyticsSchema);
    logAnalytics(input.name, input.context || {});
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
