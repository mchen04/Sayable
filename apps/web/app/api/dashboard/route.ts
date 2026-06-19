import { type NextRequest } from "next/server";
import { requireDemoSession } from "@/src/lib/demo-auth";
import { listChecksForOwner } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(request, "dashboard", { limit: 60, windowMs: 60_000 });
    const session = requireDemoSession(request);
    const checks = (await listChecksForOwner(session.sub)).map((check) => ({
      id: check.id,
      title: check.title,
      activityType: check.activityType,
      plan: check.plan,
      status: check.status,
      updatedAt: check.updatedAt
    }));
    return json({ checks });
  } catch (error) {
    return handleApiError(error, request);
  }
}
