import { createDemoSession } from "@/src/lib/demo-auth";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";
import { logAnalytics } from "@/src/lib/store";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "demo_auth", { limit: 12, windowMs: 60_000 });
    logAnalytics("google_sign_in_started", { mode: "demo_feature_flag" });
    const session = createDemoSession();
    logAnalytics("google_sign_in_completed", { mode: "demo_feature_flag" });
    return json(session, 201);
  } catch (error) {
    logAnalytics("google_sign_in_failed", { mode: "demo_feature_flag" });
    return handleApiError(error, request);
  }
}
