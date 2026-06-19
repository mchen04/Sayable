import { type NextRequest } from "next/server";
import { checkoutCapabilities } from "@/src/lib/billing";
import { getHostCheck, getHostCheckForApi, logAnalytics, serializeHostCheck, updateHostCheck } from "@/src/lib/store";
import { updateCheckSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "host_check_open", { limit: 80, windowMs: 60_000 });
    const { token } = await params;
    const data = await getHostCheck(token);
    logAnalytics("host_results_viewed", { status: data.check.status }, data.check.id);
    return json({ ...data, check: serializeHostCheck(data.check), checkout: checkoutCapabilities() });
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "host_check_update", { limit: 40, windowMs: 60_000 });
    const input = await parseJson(request, updateCheckSchema);
    const { token } = await params;
    const check = await updateHostCheck(token, input);
    if (check.status === "deleted") {
      return json({ check: serializeHostCheck(check) });
    }
    const { result } = await getHostCheckForApi(token);
    return json({ check: serializeHostCheck(check), result });
  } catch (error) {
    return handleApiError(error, request);
  }
}
