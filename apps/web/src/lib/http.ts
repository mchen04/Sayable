import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashToken, logAbuse, logAnalytics, StoreError } from "./store";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let lastBucketPruneAt = 0;

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export function fingerprint(request: NextRequest): string {
  const trustProxyHeaders = process.env.SAYABLE_TRUST_PROXY_HEADERS === "true";
  const forwarded = trustProxyHeaders ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const realIp = trustProxyHeaders ? request.headers.get("x-real-ip")?.trim() : undefined;
  return forwarded || realIp || "local";
}

export function fingerprintHash(request: NextRequest): string {
  return hashToken(fingerprint(request));
}

function sanitizedRoute(request: NextRequest): string {
  return request.nextUrl.pathname
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{12,}$/.test(segment) ? "[token]" : segment))
    .join("/");
}

export function enforceRateLimit(
  request: NextRequest,
  route: string,
  options: { limit: number; windowMs: number }
): void {
  const key = `${route}:${fingerprint(request)}`;
  const now = Date.now();
  // Reclaim expired buckets at most once a minute, on any code path, so this
  // in-memory Map can't accumulate stale (route,ip) keys over a long-lived process.
  if (now - lastBucketPruneAt > 60_000) {
    lastBucketPruneAt = now;
    for (const [k, b] of buckets) {
      if (b.resetAt < now) {
        buckets.delete(k);
      }
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > options.limit) {
    logAbuse(route, "rate_limit", fingerprintHash(request));
    logAnalytics("limit_hit", { route });
    throw new StoreError(429, "Too many attempts. Wait a moment and try again.");
  }
}

export async function parseJson<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new StoreError(400, "Send a valid JSON payload.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new StoreError(400, parsed.error.issues[0]?.message || "Invalid request.");
  }
  return parsed.data;
}

export function handleApiError(error: unknown, request?: NextRequest): NextResponse {
  const context = request
    ? {
        route: sanitizedRoute(request),
        method: request.method,
        request_hash: fingerprintHash(request)
      }
    : {};
  if (error instanceof StoreError) {
    logAnalytics("error_shown", {
      ...context,
      status: error.status,
      error_kind: error.telemetry.kind || "store",
      ...(error.telemetry.tokenClass ? { token_class: error.telemetry.tokenClass } : {}),
      ...(error.telemetry.reason ? { reason: error.telemetry.reason } : {})
    });
    return json({ error: error.message }, error.status);
  }
  console.error("Sayable API error", context, error);
  logAnalytics("error_shown", { ...context, status: 500, error_kind: "unexpected" });
  return json({ error: "Something went wrong. Try again." }, 500);
}
