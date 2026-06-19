import "server-only";

import { hashToken } from "./store-backend";
import { type CheckStatus, type StoreFile, type StoredCheck, StoreError } from "./store-types";

type CheckTokenHashField = "guestTokenHash" | "hostTokenHash" | "resultTokenHash";

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
