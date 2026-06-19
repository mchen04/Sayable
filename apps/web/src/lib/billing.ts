import "server-only";

import crypto from "node:crypto";
import {
  completePremiumCheckoutBySession,
  preflightPremiumCheckoutForTarget,
  publicBaseUrl,
  startPremiumCheckoutForTarget,
  upgradeCheckForTarget,
  type PremiumCheckoutOutcome,
  type PremiumCheckoutTarget
} from "./store";
import { type AuditLog, type PurchaseRecord, StoreError } from "./store-types";

interface StripeCheckoutSession {
  id: string;
  url?: string | null;
}

interface StripeCheckoutCompletedEvent {
  type: "checkout.session.completed";
  data: {
    object: {
      id: string;
      payment_intent?: string | null;
      metadata?: {
        check_id?: string;
        owner_user_id?: string;
      };
    };
  };
}

export interface PremiumCheckoutResult {
  purchase: PurchaseRecord;
  checkoutUrl?: string;
}

export interface PremiumCheckoutCapabilities {
  canSimulateOutcomes: boolean;
}

function stripeMode(): "mock" | "test" {
  return process.env.STRIPE_MODE === "test" ? "test" : "mock";
}

export function checkoutCapabilities(): PremiumCheckoutCapabilities {
  return {
    canSimulateOutcomes: stripeMode() === "mock"
  };
}

function requireStripeTestConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !publishableKey || !webhookSecret) {
    throw new StoreError(501, "Stripe test mode needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
  }
  return { secretKey };
}

function verifyStripeSignature(payload: string, signatureHeader: string | null): void {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new StoreError(501, "Stripe webhook secret is not configured.");
  }
  const parts = Object.fromEntries(
    (signatureHeader || "").split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) {
    throw new StoreError(400, "Stripe webhook signature is missing.");
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new StoreError(400, "Stripe webhook signature is too old.");
  }
  const actual = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new StoreError(400, "Stripe webhook signature is invalid.");
  }
}

async function createStripeCheckoutSession(
  ownerUserId: string,
  checkId: string,
  checkTitle: string
): Promise<StripeCheckoutSession> {
  const { secretKey } = requireStripeTestConfig();
  const baseUrl = publicBaseUrl();
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${baseUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${baseUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}&status=cancelled`,
    client_reference_id: checkId,
    "metadata[check_id]": checkId,
    "metadata[owner_user_id]": ownerUserId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "499",
    "line_items[0][price_data][product_data][name]": "Sayable Premium Check",
    "line_items[0][price_data][product_data][description]": checkTitle.slice(0, 240)
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Idempotency-Key": `sayable-premium-${checkId}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const session = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok || !session.id || !session.url) {
    throw new StoreError(502, session.error?.message || "Stripe Checkout session could not be created.");
  }
  return session;
}

async function createCheckoutForTarget(
  target: PremiumCheckoutTarget,
  actor: Extract<AuditLog["actor"], "demo_user" | "host">,
  outcome: PremiumCheckoutOutcome = "success"
): Promise<PremiumCheckoutResult> {
  if (stripeMode() === "mock") {
    return {
      purchase: await upgradeCheckForTarget(target, outcome, "mock", {}, actor)
    };
  }
  if (outcome !== "success") {
    throw new StoreError(400, "Checkout outcome simulation is only available in mock mode.");
  }
  const check = await preflightPremiumCheckoutForTarget(target);
  const session = await createStripeCheckoutSession(target.ownerUserId, check.id, check.title);
  const purchase = await startPremiumCheckoutForTarget(target, session.id, actor);
  return session.url ? { purchase, checkoutUrl: session.url } : { purchase };
}

export async function createPremiumCheckout(
  hostToken: string,
  ownerUserId: string,
  actor: Extract<AuditLog["actor"], "demo_user" | "host">,
  outcome: PremiumCheckoutOutcome = "success"
): Promise<PremiumCheckoutResult> {
  return createCheckoutForTarget({ type: "hostToken", hostToken, ownerUserId }, actor, outcome);
}

export async function createPremiumCheckoutForCheck(
  checkId: string,
  ownerUserId: string,
  actor: Extract<AuditLog["actor"], "demo_user" | "host">,
  outcome: PremiumCheckoutOutcome = "success"
): Promise<PremiumCheckoutResult> {
  return createCheckoutForTarget({ type: "checkId", checkId, ownerUserId }, actor, outcome);
}

export async function handleBillingWebhook(payload: string, signatureHeader: string | null): Promise<void> {
  verifyStripeSignature(payload, signatureHeader);
  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: { id?: string; payment_intent?: string | null; metadata?: Record<string, string | undefined> } };
  };
  if (event.type !== "checkout.session.completed") {
    return;
  }
  const completed = event as StripeCheckoutCompletedEvent;
  const metadata = completed.data.object.metadata;
  await completePremiumCheckoutBySession(completed.data.object.id, completed.data.object.payment_intent || undefined, {
    ...(metadata?.check_id ? { checkId: metadata.check_id } : {}),
    ...(metadata?.owner_user_id ? { ownerUserId: metadata.owner_user_id } : {})
  });
}
