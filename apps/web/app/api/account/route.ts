import { type NextRequest } from "next/server";
import { requireDemoSession } from "@/src/lib/demo-auth";
import { deleteOwnerAccount, logAudit } from "@/src/lib/store";
import { enforceRateLimit, handleApiError, json } from "@/src/lib/http";

export async function DELETE(request: NextRequest) {
  try {
    enforceRateLimit(request, "account_delete", { limit: 6, windowMs: 60_000 });
    const session = requireDemoSession(request);
    const result = await deleteOwnerAccount(session.sub);
    logAudit("account_delete_requested", "Signed host deleted account-owned Comfort Checks.", "demo_user");
    return json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error, request);
  }
}
