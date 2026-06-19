import "server-only";

import crypto from "node:crypto";
import { defaultThemeForActivity, getPlanLimits } from "@sayable/core";
import { mutateStore, now, readStore } from "./store-backend";
import { requireCheckById, requireCheckByToken, requireOwnerCheck, requireUsableCheck } from "./store-check-policy";
import { type AuditLog, type PurchaseRecord, type StoreFile, type StoredCheck, StoreError } from "./store-types";

export type PremiumCheckoutOutcome = "success" | "failed" | "cancelled";
export type PremiumCheckoutTarget =
  | { type: "hostToken"; hostToken: string; ownerUserId: string }
  | { type: "checkId"; checkId: string; ownerUserId: string };

type CheckoutActor = Extract<AuditLog["actor"], "demo_user" | "host" | "system">;
type CheckoutMode = PurchaseRecord["mode"];
type CheckoutStripeIds = { checkoutSessionId?: string; paymentIntentId?: string };
type TerminalCheckoutStatus = Exclude<PurchaseRecord["status"], "started">;

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function resolvePremiumCheck(
  store: StoreFile,
  target: PremiumCheckoutTarget
): StoredCheck {
  const check =
    target.type === "hostToken"
      ? requireCheckByToken(store, target.hostToken, "hostTokenHash", "host", "Host link not found.")
      : requireOwnerCheck(store, target.checkId, target.ownerUserId);
  assertPremiumUpgradeAllowed(check, target.ownerUserId);
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
  status: TerminalCheckoutStatus,
  mode: CheckoutMode,
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

function purchaseBase(check: StoredCheck, createdAt: string): Omit<PurchaseRecord, "mode" | "status"> {
  return {
    id: crypto.randomUUID(),
    checkId: check.id,
    productType: "premium_check_upgrade",
    amountCents: 499,
    createdAt
  };
}

function startedCheckoutForCheck(store: StoreFile, checkId: string): PurchaseRecord | undefined {
  return store.purchases.find(
    (purchase) => purchase.checkId === checkId && purchase.mode === "test" && purchase.status === "started"
  );
}

function recordUpgradeOutcome(
  store: StoreFile,
  check: StoredCheck,
  outcome: PremiumCheckoutOutcome,
  mode: CheckoutMode,
  stripeIds: CheckoutStripeIds,
  actor: CheckoutActor
): PurchaseRecord {
  const status: TerminalCheckoutStatus = outcome === "success" ? "completed" : outcome;
  const createdAt = now();
  const purchase: PurchaseRecord = {
    ...purchaseBase(check, createdAt),
    mode,
    status,
    ...(stripeIds.checkoutSessionId ? { stripeCheckoutSessionId: stripeIds.checkoutSessionId } : {}),
    ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId } : {})
  };
  if (status === "completed") {
    applyPremiumEntitlements(check, createdAt);
  }
  store.purchases.push(purchase);
  recordPremiumCheckoutEvent(store, check, status, mode, actor, createdAt);
  return purchase;
}

function createStartedPurchase(check: StoredCheck, checkoutSessionId: string, createdAt: string): PurchaseRecord {
  return {
    ...purchaseBase(check, createdAt),
    mode: "test",
    status: "started",
    stripeCheckoutSessionId: checkoutSessionId
  };
}

function recordStartedCheckout(
  store: StoreFile,
  check: StoredCheck,
  checkoutSessionId: string,
  actor: CheckoutActor
): PurchaseRecord {
  const existing = startedCheckoutForCheck(store, check.id);
  if (existing) {
    if (existing.stripeCheckoutSessionId === checkoutSessionId) {
      return existing;
    }
    throw new StoreError(409, "Premium checkout is already in progress for this Comfort Check.");
  }
  const startedAt = now();
  const purchase = createStartedPurchase(check, checkoutSessionId, startedAt);
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
}

export async function preflightPremiumCheckoutForTarget(target: PremiumCheckoutTarget): Promise<StoredCheck> {
  const store = await readStore();
  return resolvePremiumCheck(store, target);
}

export function upgradeCheckForTarget(
  target: PremiumCheckoutTarget,
  outcome: PremiumCheckoutOutcome = "success",
  mode: CheckoutMode = "mock",
  stripeIds: CheckoutStripeIds = {},
  actor: CheckoutActor = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = resolvePremiumCheck(store, target);
    return recordUpgradeOutcome(store, check, outcome, mode, stripeIds, actor);
  });
}

export function startPremiumCheckoutForTarget(
  target: PremiumCheckoutTarget,
  checkoutSessionId: string,
  actor: CheckoutActor = "host"
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = resolvePremiumCheck(store, target);
    return recordStartedCheckout(store, check, checkoutSessionId, actor);
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
      check = requireCheckById(store, metadata.checkId);
      if (check.ownerUserId !== metadata.ownerUserId) {
        throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
      }
      if (check.plan === "premium") {
        return recordUpgradeOutcome(
          store,
          check,
          "cancelled",
          "test",
          { checkoutSessionId, ...(paymentIntentId ? { paymentIntentId } : {}) },
          "system"
        );
      }
      purchase = createStartedPurchase(check, checkoutSessionId, now());
      store.purchases.push(purchase);
    }
    if (!check) {
      throw new StoreError(404, "Comfort Check not found.");
    }
    if (purchase.status === "completed") {
      return purchase;
    }
    if (check.plan === "premium") {
      if (purchase.status === "started") {
        const cancelledAt = now();
        purchase.status = "cancelled";
        if (paymentIntentId) {
          purchase.stripePaymentIntentId = paymentIntentId;
        }
        recordPremiumCheckoutEvent(store, check, "cancelled", "test", "system", cancelledAt);
      }
      return purchase;
    }
    if (purchase.status !== "started") {
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
  const check = requireCheckById(store, purchase.checkId);
  if (check.ownerUserId !== ownerUserId) {
    throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
  }
  return {
    checkId: check.id,
    status: purchase.status,
    plan: check.plan
  };
}
