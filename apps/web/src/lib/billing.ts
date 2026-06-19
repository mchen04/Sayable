import "server-only";

import { publicBaseUrl, startPremiumCheckout, upgradeCheck } from "./store";
import { StoreError } from "./store-types";

interface StripeCheckoutSession {
  id: string;
  url?: string | null;
}

export interface PremiumCheckoutResult {
  purchase: Awaited<ReturnType<typeof upgradeCheck>>;
  checkoutUrl?: string;
}

function stripeMode(): "mock" | "test" {
  return process.env.STRIPE_MODE === "test" ? "test" : "mock";
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

async function createStripeCheckoutSession(hostToken: string, checkId: string, checkTitle: string): Promise<StripeCheckoutSession> {
  const { secretKey } = requireStripeTestConfig();
  const baseUrl = publicBaseUrl();
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${baseUrl}/checks/${hostToken}/review?premium=success`,
    cancel_url: `${baseUrl}/checks/${hostToken}/review?premium=cancelled`,
    client_reference_id: checkId,
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

export async function createPremiumCheckout(
  hostToken: string,
  ownerUserId: string,
  outcome: "success" | "failed" | "cancelled" = "success",
  checkId = "comfort-check",
  checkTitle = "Comfort Check"
): Promise<PremiumCheckoutResult> {
  if (stripeMode() === "mock") {
    return {
      purchase: await upgradeCheck(hostToken, outcome, ownerUserId, "mock")
    };
  }
  if (outcome !== "success") {
    throw new StoreError(400, "Checkout outcome simulation is only available in mock mode.");
  }
  const session = await createStripeCheckoutSession(hostToken, checkId, checkTitle);
  const purchase = await startPremiumCheckout(hostToken, ownerUserId, session.id);
  return session.url ? { purchase, checkoutUrl: session.url } : { purchase };
}
