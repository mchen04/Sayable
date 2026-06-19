import "server-only";

import crypto from "node:crypto";
import { hashToken, mutateStore, now } from "./store-backend";
import { type CheckStatus, type StoreErrorTelemetry, type StoreFile, type StoredCheck, StoreError } from "./store-types";

type CheckTokenHashField = "guestTokenHash" | "hostTokenHash" | "resultTokenHash";
type TokenClass = NonNullable<StoreErrorTelemetry["tokenClass"]>;

interface TokenValidationOptions {
  persistAbuse?: boolean;
}

export function isExpired(check: StoredCheck): boolean {
  return new Date(check.expiresAt).getTime() < Date.now();
}

export function visibleStatus(check: StoredCheck): CheckStatus {
  return check.status === "active" && isExpired(check) ? "expired" : check.status;
}

export function requireUsableCheck(check: StoredCheck): void {
  if (check.status === "deleted") {
    throw new StoreError(410, "This Comfort Check has been deleted.");
  }
  if (check.status === "closed") {
    throw new StoreError(410, "This Comfort Check is closed.");
  }
  if (isExpired(check)) {
    check.status = "expired";
    throw new StoreError(410, "This Comfort Check has expired.");
  }
}

export function findCheckByToken(store: StoreFile, token: string, field: CheckTokenHashField): StoredCheck | undefined {
  return store.checks.find((check) => check[field] === hashToken(token));
}

function recordTokenAbuse(store: StoreFile, tokenClass: TokenClass, token: string): void {
  store.abuseEvents.push({
    id: crypto.randomUUID(),
    route: `token:${tokenClass}`,
    reason: "invalid_token",
    fingerprintHash: hashToken(token),
    createdAt: now()
  });
}

function persistTokenAbuse(tokenClass: TokenClass, token: string): void {
  void mutateStore((store) => {
    recordTokenAbuse(store, tokenClass, token);
  }).catch((error) => console.error("Sayable token abuse log failed", error));
}

export function tokenValidationFailure(
  store: StoreFile,
  tokenClass: TokenClass,
  token: string,
  status: number,
  message: string,
  options: TokenValidationOptions = {}
): never {
  recordTokenAbuse(store, tokenClass, token);
  if (options.persistAbuse) {
    persistTokenAbuse(tokenClass, token);
  }
  throw new StoreError(status, message, {
    kind: "token_validation_failed",
    tokenClass,
    reason: "invalid_token"
  });
}

export function requireCheckByToken(
  store: StoreFile,
  token: string,
  field: CheckTokenHashField,
  tokenClass: TokenClass,
  notFoundMessage: string,
  options: TokenValidationOptions = {}
): StoredCheck {
  const check = findCheckByToken(store, token, field);
  if (!check) {
    tokenValidationFailure(store, tokenClass, token, 404, notFoundMessage, options);
  }
  return check;
}

export function requireCheckById(store: StoreFile, checkId: string, notFoundMessage = "Comfort Check not found."): StoredCheck {
  const check = store.checks.find((candidate) => candidate.id === checkId);
  if (!check) {
    throw new StoreError(404, notFoundMessage);
  }
  return check;
}

export function requireOwnerCheck(store: StoreFile, checkId: string, ownerUserId: string): StoredCheck {
  const check = store.checks.find((candidate) => candidate.id === checkId && candidate.ownerUserId === ownerUserId);
  if (!check) {
    throw new StoreError(404, "Saved Comfort Check not found.");
  }
  return check;
}
