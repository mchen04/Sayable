import { type NextRequest } from "next/server";
import { requireHostSession } from "@/src/lib/host-auth";
import { claimCheck, serializeHostCheck } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "claim_check", { limit: 12, windowMs: 60_000 });
    const session = await requireHostSession(request);
    const { token } = await params;
    const check = await claimCheck(token, session.sub, session.actor, session.mode);
    return json({ check: serializeHostCheck(check) });
  } catch (error) {
    return handleApiError(error, request);
  }
}
