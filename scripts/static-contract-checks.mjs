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

  const billingReturn = sourceFile("apps/web/components/BillingReturnClient.tsx");
  staticAssert(!billingReturn.includes("localStorage"), "Checkout return must not recover raw host tokens from browser storage");
  staticAssert(
    billingReturn.includes("/dashboard/checks/${payload.checkId}/review?premium=${premiumStatus}"),
    "Checkout return must redirect through owner-scoped dashboard review URLs"
  );

  const createForm = sourceFile("apps/web/components/CreateCheckForm.tsx");
  staticAssert(!createForm.includes("getDemoSession"), "Create recovery must use canonical host auth, not demo-only auth");
  staticAssert(createForm.includes("await existingAuthHeaders()"), "Create must attach an existing host auth session");

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
    ogRoute.includes('enforceRateLimit(request, "og_preview"') && ogRoute.includes("isActiveForPreview"),
    "OG preview route must rate-limit public token lookup and account for expiration"
  );

  const billingWebhook = sourceFile("apps/web/app/api/billing/webhook/route.ts");
  staticAssert(
    billingWebhook.includes('enforceRateLimit(request, "billing_webhook"'),
    "Billing webhook route must rate-limit malformed public requests"
  );

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
