import { type NextRequest } from "next/server";
import { requireHostSession } from "@/src/lib/host-auth";
import { getOwnerCheck, serializeHostCheck, updateOwnerCheck } from "@/src/lib/store";
import { updateCheckSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ checkId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "dashboard_check_open", { limit: 80, windowMs: 60_000 });
    const session = await requireHostSession(request);
    const { checkId } = await params;
    const data = await getOwnerCheck(checkId, session.sub);
    return json({ ...data, check: serializeHostCheck(data.check) });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "dashboard_check_update", { limit: 40, windowMs: 60_000 });
    const session = await requireHostSession(request);
    const input = await parseJson(request, updateCheckSchema);
    const { checkId } = await params;
    const check = await updateOwnerCheck(checkId, session.sub, input);
    if (check.status === "deleted") {
      return json({ check: serializeHostCheck(check) });
    }
    const { result } = await getOwnerCheck(check.id, session.sub);
    return json({ check: serializeHostCheck(check), result });
  } catch (error) {
    return handleApiError(error, request);
  }
}
