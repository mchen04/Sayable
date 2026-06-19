import { readFileSync } from "node:fs";
import path from "node:path";

function staticAssert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceFile(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assertFunctionGrant(migration, signature) {
  staticAssert(
    migration.includes(`grant execute on function ${signature} to service_role`),
    `${signature} must grant execute to service_role`
  );
  staticAssert(
    migration.includes(`revoke all on function ${signature} from public, anon, authenticated`),
    `${signature} must stay revoked from public/anon/authenticated`
  );
}

export function runStaticContractChecks() {
  const migration = sourceFile("supabase/migrations/0001_sayable_mvp.sql");
  assertFunctionGrant(
    migration,
    "public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)"
  );
  assertFunctionGrant(migration, "public.try_acquire_sayable_store_lock(text, text, integer)");
  assertFunctionGrant(migration, "public.release_sayable_store_lock(text, text)");
  staticAssert(
    !/select \*\s+from jsonb_to_recordset/.test(migration),
    "Supabase runtime replacement RPC must map json recordsets with named columns"
  );

  const storeBackend = sourceFile("apps/web/src/lib/store-backend.ts");
  staticAssert(
    storeBackend.includes("updated_at: response.updatedAt || response.createdAt"),
    "Supabase response writes must not send null updated_at values"
  );

  const billing = sourceFile("apps/web/src/lib/billing.ts");
  staticAssert(!billing.includes("/checks/${hostToken}/review?premium="), "Stripe URLs must not contain raw host tokens");
  staticAssert(billing.includes('"Idempotency-Key": `sayable-premium-${checkId}`'), "Stripe checkout sessions must use a per-check idempotency key");
  staticAssert(
    billing.includes("checkoutCapabilities") && billing.includes("canSimulateOutcomes"),
    "Billing layer must own checkout capability flags"
  );
  staticAssert(
    billing.includes("/billing/return?session_id={CHECKOUT_SESSION_ID}") &&
      billing.includes("\"metadata[check_id]\"") &&
      billing.includes("\"metadata[owner_user_id]\""),
    "Stripe test checkout must use a tokenless return route plus metadata"
  );

  const storeBilling = sourceFile("apps/web/src/lib/store-billing.ts");
  staticAssert(storeBilling.includes("startedCheckoutForCheck"), "Premium checkout starts must check for active sessions");
  staticAssert(
    storeBilling.includes("Premium checkout is already in progress for this Comfort Check."),
    "Premium checkout starts must reject duplicate active sessions"
  );
  staticAssert(
    storeBilling.includes('purchase.status = "cancelled"'),
    "Duplicate Stripe completion webhooks must cancel started duplicate sessions"
  );
  staticAssert(
    storeBilling.includes("resolvePremiumCheckoutReturn") &&
      storeBilling.includes('returnStatus === "cancelled"') &&
      storeBilling.includes("checkoutForSession"),
    "Checkout return cancellation must be resolved in the store state machine"
  );
  staticAssert(
    storeBilling.includes('reusable.status = "started"'),
    "Retrying a cancelled Stripe session must reuse the same purchase row instead of duplicating session ids"
  );
  staticAssert(
    storeBilling.includes('purchase.status !== "cancelled"') &&
      !storeBilling.includes("premium_mock_checkout") &&
      storeBilling.includes("premium_checkout_${status}") &&
      storeBilling.includes('"premium_checkout_started"'),
    "Checkout state machine must allow verified completion after browser cancellation and use neutral checkout telemetry"
  );

  const billingReturnRoute = sourceFile("apps/web/app/api/billing/return/route.ts");
  staticAssert(
    billingReturnRoute.includes("resolvePremiumCheckoutReturn") &&
      billingReturnRoute.includes('searchParams.get("status")') &&
      billingReturnRoute.includes("session.actor"),
    "Billing return API must pass return status through to the server-side checkout resolver"
  );

  const billingReturn = sourceFile("apps/web/components/BillingReturnClient.tsx");
  staticAssert(!billingReturn.includes("localStorage"), "Checkout return must not recover raw host tokens from browser storage");
  staticAssert(
    billingReturn.includes('params.set("status", returnStatus)'),
    "Checkout return client must pass Stripe return status to the server"
  );
  staticAssert(
    billingReturn.includes('payload.status === "started"') && billingReturn.includes("window.setTimeout"),
    "Checkout return must wait on server-side started status before redirecting"
  );
  staticAssert(
    billingReturn.includes("/dashboard/checks/${payload.checkId}/review?premium=${payload.status}"),
    "Checkout return must redirect with the server-side terminal status"
  );

  const createForm = sourceFile("apps/web/components/CreateCheckForm.tsx");
  staticAssert(!createForm.includes("sayable_recent_host_tokens"), "Create flow must not persist stale host-token recovery storage");
  staticAssert(!createForm.includes("sayable_host_token_by_check_id"), "Create flow must not persist host-token dashboard maps");

  staticAssert(!createForm.includes("getDemoSession"), "Create recovery must use canonical host auth, not demo-only auth");
  staticAssert(createForm.includes("await existingAuthHeaders()"), "Create must attach an existing host auth session");

  const hostReview = sourceFile("apps/web/components/HostReviewClient.tsx");
  staticAssert(!hostReview.includes("sayable_host_token_by_check_id"), "Host review must not persist stale dashboard host-token maps");
  staticAssert(!hostReview.includes("endpoints.hostToken"), "Host review must use explicit claim endpoints, not raw token props");
  staticAssert(
    hostReview.includes("data.checkout.canSimulateOutcomes"),
    "Host review must hide checkout simulation controls unless billing capabilities allow them"
  );

  const hostEndpoints = sourceFile("apps/web/components/host-endpoints.ts");
  staticAssert(
    !hostEndpoints.includes("rememberHostToken") && !hostEndpoints.includes("hostToken?:"),
    "Endpoint config must not carry stale host-token recovery fields"
  );
  staticAssert(
    hostEndpoints.includes("claimPath") && hostReview.includes("endpoints.claimPath"),
    "Raw host-token review pages must pass claim URLs explicitly"
  );

  const coreTypes = sourceFile("packages/core/src/types.ts");
  staticAssert(!/interface GuestResponse[\s\S]*responseTokenHash/.test(coreTypes), "Core GuestResponse must not carry token hashes");

  const store = sourceFile("apps/web/src/lib/store.ts");
  staticAssert(!store.includes("response: { ...response, responseTokenHash: token }"), "submitResponse must return raw tokens explicitly");
  staticAssert(store.includes("responseToken: token"), "submitResponse must return an explicit responseToken");

  const ogRoute = sourceFile("apps/web/app/api/og/check/[token]/route.ts");
  staticAssert(
    ogRoute.includes("getPreviewByToken") && !ogRoute.includes("getPublicCheck") && !ogRoute.includes("getSnapshot"),
    "OG preview must not use token-validation failures as normal control flow"
  );
  staticAssert(
    ogRoute.includes('enforceRateLimit(request, "og_preview"') &&
      ogRoute.includes("svgResponse(unavailablePayload(detail), status)") &&
      ogRoute.includes("isActiveForPreview"),
    "OG preview route must rate-limit public token lookup with an image error response and account for expiration"
  );

  const hostUpgradeRoute = sourceFile("apps/web/app/api/checks/host/[token]/upgrade/route.ts");
  const dashboardUpgradeRoute = sourceFile("apps/web/app/api/dashboard/checks/[checkId]/upgrade/route.ts");
  const hostCheckRoute = sourceFile("apps/web/app/api/checks/host/[token]/route.ts");
  const dashboardCheckRoute = sourceFile("apps/web/app/api/dashboard/checks/[checkId]/route.ts");
  staticAssert(
    !hostUpgradeRoute.includes("premium_mock") &&
      !dashboardUpgradeRoute.includes("premium_mock") &&
      hostCheckRoute.includes("checkoutCapabilities") &&
      dashboardCheckRoute.includes("checkoutCapabilities"),
    "Upgrade routes must use neutral labels while host review APIs expose billing-owned capabilities"
  );

  const storeCheckPolicy = sourceFile("apps/web/src/lib/store-check-policy.ts");
  staticAssert(
      storeCheckPolicy.includes("persistInvalidTokenAbuse") &&
      !storeCheckPolicy.includes("recordTokenAbuse") &&
      !/tokenValidationFailure\(\s*store/.test(storeCheckPolicy),
    "Token validation failures must use one persisted abuse path without dead in-memory mutation"
  );

  const billingWebhook = sourceFile("apps/web/app/api/billing/webhook/route.ts");
  staticAssert(
    billingWebhook.includes('enforceRateLimit(request, "billing_webhook"'),
    "Billing webhook route must rate-limit malformed public requests"
  );

  const schemas = sourceFile("apps/web/src/lib/schemas.ts");
  staticAssert(!schemas.includes("premium_mock_checkout"), "Analytics event names must be neutral across mock and Stripe modes");

  const nativeHome = sourceFile("apps/mobile/app/index.tsx");
  staticAssert(nativeHome.includes("creatorNonce"), "Native anonymous create must include a persisted creator nonce");
  staticAssert(!nativeHome.includes("Share.share"), "Native create must open review before sharing a guest link");

  const layout = sourceFile("apps/web/app/layout.tsx");
  const guestPage = sourceFile("apps/web/app/c/[guestToken]/page.tsx");
  staticAssert(layout.includes('images: ["/api/og/check/default"]'), "Default Twitter metadata must include the OG image");
  staticAssert(
    guestPage.includes("images: [`/api/og/check/${guestToken}`]"),
    "Guest Twitter metadata must include the generated OG image"
  );

  for (const relativePath of ["apps/web/app/checks/[hostToken]/review/page.tsx", "apps/web/app/h/[hostToken]/page.tsx"]) {
    const hostPage = sourceFile(relativePath);
    staticAssert(hostPage.includes("robots: { index: false"), `${relativePath} must mark host-token pages noindex`);
    staticAssert(!hostPage.includes("/api/og/check/${hostToken}"), `${relativePath} must not expose host tokens in OG images`);
    staticAssert(!hostPage.includes("canonicalUrl"), `${relativePath} must not publish canonical host-token URLs`);
  }

  const dashboard = sourceFile("apps/web/components/DashboardClient.tsx");
  staticAssert(!dashboard.includes("localStorage"), "Dashboard management must not depend on same-device host-token storage");
}
