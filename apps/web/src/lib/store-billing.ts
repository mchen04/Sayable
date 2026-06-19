import "server-only";

import crypto from "node:crypto";
import { defaultThemeForActivity, getPlanLimits } from "@sayable/core";
import { hashToken, mutateStore, now, readStore } from "./store-backend";
import { type AuditLog, type PurchaseRecord, type StoreFile, type StoredCheck, StoreError } from "./store-types";

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function isExpired(check: StoredCheck): boolean {
  return new Date(check.expiresAt).getTime() < Date.now();
}

function requireUsableCheck(check: StoredCheck): void {
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

function requireCheckByHostToken(store: StoreFile, hostToken: string): StoredCheck {
  const check = store.checks.find((candidate) => candidate.hostTokenHash === hashToken(hostToken));
  if (!check) {
    throw new StoreError(404, "Host link not found.", {
      kind: "token_validation_failed",
      tokenClass: "host",
      reason: "invalid_token"
    });
  }
  return check;
}

function requireCheckByIdForOwner(store: StoreFile, checkId: string, ownerUserId: string): StoredCheck {
  const check = store.checks.find((candidate) => candidate.id === checkId && candidate.ownerUserId === ownerUserId);
  if (!check) {
    throw new StoreError(404, "Saved Comfort Check not found.");
  }
  return check;
}

function applyPremiumEntitlements(check: StoredCheck, completedAt: string): void {
  check.plan = "premium";
  if (check.themeId === "sayable_default") {
    check.themeId = defaultThemeForActivity(check.activityType);
  }
  check.expiresAt = addDays(new Date(), getPlanLimits("premium").retentionDays);
  check.updatedAt = completedAt;
}

function recordPremiumCheckoutEvent(
  store: StoreFile,
  check: StoredCheck,
  status: Exclude<PurchaseRecord["status"], "started">,
  mode: PurchaseRecord["mode"],
  actor: AuditLog["actor"],
  createdAt: string
): void {
  store.analyticsEvents.push({
    id: crypto.randomUUID(),
    name: `premium_mock_checkout_${status}`,
    checkId: check.id,
    createdAt,
    context: { mode, product_type: "premium_check_upgrade" }
  });
  store.auditLogs.push({
    id: crypto.randomUUID(),
    action: `premium_${mode}_checkout_${status}`,
    checkId: check.id,
    createdAt,
    actor,
    detail:
      status === "completed"
        ? `Premium Check ${mode} checkout completed.`
        : `Premium Check ${mode} checkout ${status}.`
  });
}

function assertPremiumUpgradeAllowed(check: StoredCheck, ownerUserId: string): void {
  if (!check.ownerUserId) {
    throw new StoreError(401, "Save this Comfort Check with Google before upgrading.");
  }
  if (ownerUserId !== check.ownerUserId) {
    throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
  }
  requireUsableCheck(check);
  if (check.plan === "premium") {
    throw new StoreError(409, "This Comfort Check is already Premium.");
  }
}

export async function preflightPremiumCheckout(hostToken: string, ownerUserId: string): Promise<StoredCheck> {
  const store = await readStore();
  const check = requireCheckByHostToken(store, hostToken);
  assertPremiumUpgradeAllowed(check, ownerUserId);
  return check;
}

export async function preflightPremiumCheckoutById(checkId: string, ownerUserId: string): Promise<StoredCheck> {
  const store = await readStore();
  const check = requireCheckByIdForOwner(store, checkId, ownerUserId);
  assertPremiumUpgradeAllowed(check, ownerUserId);
  return check;
}

export function upgradeCheck(
  hostToken: string,
  outcome: "success" | "failed" | "cancelled" = "success",
  ownerUserId?: string,
  mode: "mock" | "test" = "mock",
  stripeIds: { checkoutSessionId?: string; paymentIntentId?: string } = {},
  actor: Extract<AuditLog["actor"], "demo_user" | "host"> = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = requireCheckByHostToken(store, hostToken);
    assertPremiumUpgradeAllowed(check, ownerUserId || "");
    if (outcome !== "success") {
      const failedStatus: "failed" | "cancelled" = outcome === "failed" ? "failed" : "cancelled";
      const failed: PurchaseRecord = {
        id: crypto.randomUUID(),
        checkId: check.id,
        productType: "premium_check_upgrade",
        amountCents: 499,
        mode,
        status: failedStatus,
        createdAt: now(),
        ...(stripeIds.checkoutSessionId ? { stripeCheckoutSessionId: stripeIds.checkoutSessionId } : {}),
        ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId } : {})
      };
      store.purchases.push(failed);
      recordPremiumCheckoutEvent(store, check, failedStatus, mode, actor, failed.createdAt);
      return failed;
    }
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      checkId: check.id,
      productType: "premium_check_upgrade",
      amountCents: 499,
      mode,
      status: "completed",
      createdAt: now(),
      ...(stripeIds.checkoutSessionId ? { stripeCheckoutSessionId: stripeIds.checkoutSessionId } : {}),
      ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId } : {})
    };
    applyPremiumEntitlements(check, purchase.createdAt);
    store.purchases.push(purchase);
    recordPremiumCheckoutEvent(store, check, "completed", mode, actor, purchase.createdAt);
    return purchase;
  });
}

export function upgradeCheckById(
  checkId: string,
  ownerUserId: string,
  outcome: "success" | "failed" | "cancelled" = "success",
  mode: "mock" | "test" = "mock",
  stripeIds: { checkoutSessionId?: string; paymentIntentId?: string } = {},
  actor: Extract<AuditLog["actor"], "demo_user" | "host"> = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = requireCheckByIdForOwner(store, checkId, ownerUserId);
    assertPremiumUpgradeAllowed(check, ownerUserId);
    if (outcome !== "success") {
      const failedStatus: "failed" | "cancelled" = outcome === "failed" ? "failed" : "cancelled";
      const failed: PurchaseRecord = {
        id: crypto.randomUUID(),
        checkId: check.id,
        productType: "premium_check_upgrade",
        amountCents: 499,
        mode,
        status: failedStatus,
        createdAt: now(),
        ...(stripeIds.checkoutSessionId ? { stripeCheckoutSessionId: stripeIds.checkoutSessionId } : {}),
        ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId } : {})
      };
      store.purchases.push(failed);
      recordPremiumCheckoutEvent(store, check, failedStatus, mode, actor, failed.createdAt);
      return failed;
    }
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      checkId: check.id,
      productType: "premium_check_upgrade",
      amountCents: 499,
      mode,
      status: "completed",
      createdAt: now(),
      ...(stripeIds.checkoutSessionId ? { stripeCheckoutSessionId: stripeIds.checkoutSessionId } : {}),
      ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId } : {})
    };
    applyPremiumEntitlements(check, purchase.createdAt);
    store.purchases.push(purchase);
    recordPremiumCheckoutEvent(store, check, "completed", mode, actor, purchase.createdAt);
    return purchase;
  });
}

export function startPremiumCheckout(
  hostToken: string,
  ownerUserId: string,
  checkoutSessionId: string,
  actor: Extract<AuditLog["actor"], "demo_user" | "host"> = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = requireCheckByHostToken(store, hostToken);
    assertPremiumUpgradeAllowed(check, ownerUserId);
    const startedAt = now();
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      checkId: check.id,
      productType: "premium_check_upgrade",
      amountCents: 499,
      mode: "test",
      status: "started",
      stripeCheckoutSessionId: checkoutSessionId,
      createdAt: startedAt
    };
    store.purchases.push(purchase);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "premium_mock_checkout_started",
      checkId: check.id,
      createdAt: startedAt,
      context: { mode: "test", product_type: "premium_check_upgrade" }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "premium_test_checkout_started",
      checkId: check.id,
      createdAt: startedAt,
      actor,
      detail: "Stripe test checkout session created for Premium Check."
    });
    return purchase;
  });
}

export function startPremiumCheckoutById(
  checkId: string,
  ownerUserId: string,
  checkoutSessionId: string,
  actor: Extract<AuditLog["actor"], "demo_user" | "host"> = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = requireCheckByIdForOwner(store, checkId, ownerUserId);
    assertPremiumUpgradeAllowed(check, ownerUserId);
    const startedAt = now();
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      checkId: check.id,
      productType: "premium_check_upgrade",
      amountCents: 499,
      mode: "test",
      status: "started",
      stripeCheckoutSessionId: checkoutSessionId,
      createdAt: startedAt
    };
    store.purchases.push(purchase);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "premium_mock_checkout_started",
      checkId: check.id,
      createdAt: startedAt,
      context: { mode: "test", product_type: "premium_check_upgrade" }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "premium_test_checkout_started",
      checkId: check.id,
      createdAt: startedAt,
      actor,
      detail: "Stripe test checkout session created for Premium Check."
    });
    return purchase;
  });
}

export function completePremiumCheckoutBySession(
  checkoutSessionId: string,
  paymentIntentId?: string,
  metadata: { checkId?: string; ownerUserId?: string } = {}
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    let purchase = store.purchases.find((candidate) => candidate.stripeCheckoutSessionId === checkoutSessionId);
    let check: StoredCheck | undefined;
    if (purchase) {
      check = store.checks.find((candidate) => candidate.id === purchase!.checkId);
    }
    if (!purchase) {
      if (!metadata.checkId || !metadata.ownerUserId) {
        throw new StoreError(404, "Premium checkout session was not found.");
      }
      check = store.checks.find((candidate) => candidate.id === metadata.checkId);
      if (!check) {
        throw new StoreError(404, "Comfort Check not found.");
      }
      if (check.ownerUserId !== metadata.ownerUserId) {
        throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
      }
      purchase = {
        id: crypto.randomUUID(),
        checkId: check.id,
        productType: "premium_check_upgrade",
        amountCents: 499,
        mode: "test",
        status: "started",
        stripeCheckoutSessionId: checkoutSessionId,
        createdAt: now()
      };
      store.purchases.push(purchase);
    }
    if (!check) {
      throw new StoreError(404, "Comfort Check not found.");
    }
    if (purchase.status === "completed") {
      return purchase;
    }
    requireUsableCheck(check);
    const completedAt = now();
    purchase.status = "completed";
    if (paymentIntentId) {
      purchase.stripePaymentIntentId = paymentIntentId;
    }
    applyPremiumEntitlements(check, completedAt);
    recordPremiumCheckoutEvent(store, check, "completed", "test", "system", completedAt);
    return purchase;
  });
}

export async function getPremiumCheckoutReturn(
  checkoutSessionId: string,
  ownerUserId: string
): Promise<{
  checkId: string;
  status: PurchaseRecord["status"];
  plan: StoredCheck["plan"];
}> {
  const store = await readStore();
  const purchase = store.purchases.find((candidate) => candidate.stripeCheckoutSessionId === checkoutSessionId);
  if (!purchase) {
    throw new StoreError(404, "Premium checkout session was not found.");
  }
  const check = store.checks.find((candidate) => candidate.id === purchase.checkId);
  if (!check) {
    throw new StoreError(404, "Comfort Check not found.");
  }
  if (check.ownerUserId !== ownerUserId) {
    throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
  }
  return {
    checkId: check.id,
    status: purchase.status,
    plan: check.plan
  };
}
