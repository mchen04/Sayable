import crypto from "node:crypto";
import { type NextRequest } from "next/server";
import { completePremiumCheckoutBySession } from "@/src/lib/store";
import { StoreError } from "@/src/lib/store-types";
import { handleApiError, json } from "@/src/lib/http";

interface StripeCheckoutCompletedEvent {
  type: "checkout.session.completed";
  data: {
    object: {
      id: string;
      payment_intent?: string | null;
    };
  };
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

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    verifyStripeSignature(payload, request.headers.get("stripe-signature"));
    const event = JSON.parse(payload) as { type?: string; data?: { object?: { id?: string; payment_intent?: string | null } } };
    if (event.type === "checkout.session.completed") {
      const completed = event as StripeCheckoutCompletedEvent;
      await completePremiumCheckoutBySession(completed.data.object.id, completed.data.object.payment_intent || undefined);
    }
    return json({ received: true });
  } catch (error) {
    return handleApiError(error, request);
  }
}
