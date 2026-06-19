import { type NextRequest } from "next/server";
import { getPublicCheck, logAnalytics } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "guest_check_open", { limit: 80, windowMs: 60_000 });
    const { token } = await params;
    const { check, responseCount } = await getPublicCheck(token);
    logAnalytics("guest_page_opened", { status: check.status }, check.id);
    return json({
      check: {
        title: check.title,
        activityType: check.activityType,
        plan: check.plan,
        status: check.status,
        draft: check.draft,
        themeId: check.themeId,
        customTheme: check.customTheme,
        expiresAt: check.expiresAt
      },
      responseCount
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
