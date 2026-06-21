import { type NextRequest } from "next/server";
import { checkoutCapabilities } from "@/src/lib/billing";
import { getHostCheck, serializeHostCheck, updateHostCheck } from "@/src/lib/store";
import { updateCheckSchema } from "@/src/lib/schemas";
import { enforceRateLimit, handleApiError, json, parseJson } from "@/src/lib/http";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    enforceRateLimit(request, "host_check_open", { limit: 80, windowMs: 60_000 });
    const { token } = await params;
    const data = await getHostCheck(token);
    // NOTE: host results are polled every ~7s, so we deliberately do NOT log an
    // analytics row here — that would route a read through the whole-store
    // mutation path (full DELETE+re-INSERT under the global store lock on the
    // Supabase backend) on every poll. View telemetry, if needed, belongs on a
    // dedicated row-level insert, not the read path.
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
    const { check, result } = await updateHostCheck(token, input);
    if (check.status === "deleted") {
      return json({ check: serializeHostCheck(check) });
    }
    return json({ check: serializeHostCheck(check), result });
  } catch (error) {
    return handleApiError(error, request);
  }
}
