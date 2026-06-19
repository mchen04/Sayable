import "server-only";

import crypto from "node:crypto";
import { StoreError } from "./store-types";

export interface DemoSessionPayload {
  sub: string;
  exp: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

declare global {
  var __sayableDemoAuthSecret: string | undefined;
}

function runtimeSecret(): string {
  globalThis.__sayableDemoAuthSecret ||= crypto.randomBytes(32).toString("base64url");
  return globalThis.__sayableDemoAuthSecret;
}

function secret(): string {
  return process.env.SAYABLE_DEMO_AUTH_SECRET || runtimeSecret();
}

export function isDemoAuthEnabled(): boolean {
  return process.env.SAYABLE_DEMO_AUTH_ENABLED === "true";
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createDemoSession(ownerUserId = `demo_${crypto.randomUUID()}`) {
  if (!isDemoAuthEnabled()) {
    throw new StoreError(404, "Demo Google claim is disabled. Configure Supabase Google OAuth for this environment.");
  }
  const payload: DemoSessionPayload = {
    sub: ownerUserId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const encoded = base64url(JSON.stringify(payload));
  return {
    ownerUserId,
    token: `${encoded}.${sign(encoded)}`
  };
}

export function verifyDemoToken(token: string): DemoSessionPayload {
  if (!isDemoAuthEnabled()) {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  let payload: DemoSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DemoSessionPayload;
  } catch {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new StoreError(401, "Sign in with Google before continuing.");
  }
  return payload;
}
