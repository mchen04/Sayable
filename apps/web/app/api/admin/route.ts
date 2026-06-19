import { type NextRequest } from "next/server";
import crypto from "node:crypto";
import {
  StoreError,
  adminSnapshot,
  adminUpdateCheckById,
  logAbuse,
  logAudit,
  serializeHostCheck,
  updateHostCheck
} from "@/src/lib/store";
import { adminActionSchema } from "@/src/lib/schemas";
import { enforceRateLimit, fingerprintHash, handleApiError, json, parseJson } from "@/src/lib/http";

function isAllowed(request: NextRequest): boolean {
  const configured = process.env.SAYABLE_ADMIN_TOKEN;
  if (!configured || configured === "replace-with-local-admin-token") {
    return false;
  }
  const supplied = request.headers.get("x-sayable-admin-token") || "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(request, "admin", { limit: 20, windowMs: 60_000 });
    if (!isAllowed(request)) {
      logAbuse("admin", "invalid_admin_token", fingerprintHash(request));
      throw new StoreError(401, "Admin token required.", {
        kind: "token_validation_failed",
        tokenClass: "admin",
        reason: "unauthorized"
      });
    }
    logAudit("admin_snapshot_viewed", "Admin operator inspected the redacted admin snapshot.", "admin");
    return json(await adminSnapshot());
  } catch (error) {
    return handleApiError(error, request);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceRateLimit(request, "admin", { limit: 20, windowMs: 60_000 });
    if (!isAllowed(request)) {
      logAbuse("admin", "invalid_admin_token", fingerprintHash(request));
      throw new StoreError(401, "Admin token required.", {
        kind: "token_validation_failed",
        tokenClass: "admin",
        reason: "unauthorized"
      });
    }
    const body = await parseJson(request, adminActionSchema);
    const status = body.action === "close" ? "closed" : "deleted";
    const check = body.checkId
      ? await adminUpdateCheckById(body.checkId, status)
      : await updateHostCheck(body.hostToken ?? "", { status });
    if (body.hostToken) {
      logAudit(`admin_${body.action}`, "Admin operator changed check status with a host token.", "admin", check.id);
    }
    return json({ check: serializeHostCheck(check) });
  } catch (error) {
    return handleApiError(error, request);
  }
}
