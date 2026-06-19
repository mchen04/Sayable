import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const activityTypes = [
  "dinner_drinks",
  "birthday",
  "casual_hangout",
  "tickets_event",
  "group_trip",
  "home_chill",
  "custom"
];

const port = 3300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(path.join(tmpdir(), "sayable-smoke-"));
const storePath = path.join(tempDir, "store.json");
await rm(path.join(process.cwd(), "apps", "web", ".next", "dev"), { recursive: true, force: true });

const env = {
  ...process.env,
  NEXT_PUBLIC_WEB_BASE_URL: baseUrl,
  SAYABLE_STORE_PATH: storePath,
  SAYABLE_ADMIN_TOKEN: "smoke-admin-token",
  SAYABLE_DEMO_AUTH_ENABLED: "true",
  SAYABLE_DEMO_AUTH_SECRET: crypto.randomBytes(32).toString("base64url"),
  SAYABLE_TRUST_PROXY_HEADERS: "true",
  STRIPE_MODE: "mock"
};

function staticAssert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceFile(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function runStaticContractChecks() {
  const migration = sourceFile("supabase/migrations/0001_sayable_mvp.sql");
  staticAssert(
    migration.includes(
      "grant execute on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role"
    ),
    "Supabase runtime replacement RPC must grant execute to service_role"
  );
  staticAssert(
    migration.includes(
      "revoke all on function public.replace_sayable_runtime_store(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated"
    ),
    "Supabase runtime replacement RPC must stay revoked from public/anon/authenticated"
  );

  const billing = sourceFile("apps/web/src/lib/billing.ts");
  staticAssert(!billing.includes("/checks/${hostToken}/review?premium="), "Stripe URLs must not contain raw host tokens");
  staticAssert(
    billing.includes("/billing/return?session_id={CHECKOUT_SESSION_ID}") &&
      billing.includes("\"metadata[check_id]\"") &&
      billing.includes("\"metadata[owner_user_id]\""),
    "Stripe test checkout must use a tokenless return route plus metadata"
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

  const nativeHome = sourceFile("apps/mobile/app/index.tsx");
  staticAssert(nativeHome.includes("creatorNonce"), "Native anonymous create must include a persisted creator nonce");
  staticAssert(!nativeHome.includes("Share.share"), "Native create must open review before sharing a guest link");
}

runStaticContractChecks();

const server = spawn("npm", ["run", "dev", "-w", "@sayable/web", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
const serverExit = new Promise((resolve) => {
  server.once("exit", resolve);
});

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function forgeDemoToken(ownerUserId) {
  const payload = Buffer.from(
    JSON.stringify({ sub: ownerUserId, exp: Math.floor(Date.now() / 1000) + 3600 }),
    "utf8"
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", "sayable-local-demo-auth-secret")
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const { response, body } = await request("/api/health");
      if (response.ok && body?.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next dev server.\n${serverOutput}`);
}

async function createCheck(activityType, hostIndex = 1) {
  return createCheckWithOptions(activityType, { hostIndex });
}

async function createCheckWithOptions(activityType, { hostIndex = 1, token, title } = {}) {
  const { response, body } = await request("/api/checks", {
    method: "POST",
    headers: {
      "x-forwarded-for": `198.51.100.${hostIndex}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      title: title || `Smoke ${activityType}`,
      activityType,
      currentIdea: activityType === "tickets_event" ? "$88 per person" : "$42 per person",
      vibe: "low_key"
    })
  });
  assert(response.status === 201, `create ${activityType} failed: ${response.status} ${JSON.stringify(body)}`);
  assert(body.guestToken && body.hostToken && body.guestUrl && body.hostUrl, `create ${activityType} missing tokens/urls`);
  assert(!JSON.stringify(body.check).includes("TokenHash"), `create ${activityType} leaked token hash`);
  assert(body.check.themeId === "sayable_default", `free ${activityType} should start on Sayable default theme`);
  return body;
}

function clientNonce(label) {
  return `smoke-client-nonce-${label}-0123456789`;
}

async function demoSession() {
  const { response, body } = await request("/api/auth/demo", { method: "POST" });
  assert(response.status === 201, `demo auth failed: ${response.status}`);
  return body;
}

async function main() {
  await waitForServer();

  const checks = [];
  for (const [index, activityType] of activityTypes.entries()) {
    checks.push(await createCheck(activityType, index + 1));
  }

  const primary = checks[0];
  const guestToken = primary.guestToken;
  const hostToken = primary.hostToken;

  const unclaimedUpgrade = await request(`/api/checks/host/${hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${(await demoSession()).token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(
    unclaimedUpgrade.response.status === 401,
    `unclaimed upgrade should require Google save first: ${unclaimedUpgrade.response.status} ${JSON.stringify(unclaimedUpgrade.body)}`
  );

  const publicCheck = await request(`/api/checks/guest/${guestToken}`);
  assert(publicCheck.response.ok, "guest public check did not open");
  assert(publicCheck.body.check.draft.privacyCopy.includes("private"), "guest privacy copy missing");

  const editedDraft = await request(`/api/checks/host/${hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({
      questions: [
        {
          ...publicCheck.body.check.draft.questions[0],
          prompt: "Does this dinner plan feel comfortable?"
        },
        ...publicCheck.body.check.draft.questions.slice(1)
      ],
      tiers: [
        {
          ...publicCheck.body.check.draft.tiers[0],
          label: "Easy yes, lock it"
        },
        ...publicCheck.body.check.draft.tiers.slice(1)
      ]
    })
  });
  assert(editedDraft.response.ok, "question/tier edit failed");
  assert(
    editedDraft.body.check.draft.questions[0].prompt === "Does this dinner plan feel comfortable?",
    "question edit did not persist"
  );
  assert(editedDraft.body.check.draft.tiers[0].label === "Easy yes, lock it", "tier edit did not persist");

  const resetDraft = await request(`/api/checks/host/${hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ resetDraft: true })
  });
  assert(resetDraft.response.ok, "draft reset failed");
  assert(resetDraft.body.check.draft.tiers[0].label === "Easy yes", "draft reset did not restore tier");

  const badGuest = await request(`/api/checks/guest/not-a-real-token`);
  assert(badGuest.response.status === 404, "invalid guest token should 404");

  const suppressedShareCheck = await createCheck("casual_hangout", 10);
  const suppressedEmptyShare = await request(`/api/checks/host/${suppressedShareCheck.hostToken}/final-share`, {
    method: "POST"
  });
  assert(
    suppressedEmptyShare.response.status === 409,
    `final share should reject zero-response suppressed results: ${suppressedEmptyShare.response.status} ${JSON.stringify(suppressedEmptyShare.body)}`
  );
  for (const [index, payload] of [
    { status: "in", tierId: "easy_yes", constraintIds: [] },
    { status: "maybe", tierId: "works_with_tweaks", constraintIds: [] },
    { status: "out", tierId: "not_comfortable", constraintIds: [] }
  ].entries()) {
    const submitted = await request(`/api/checks/guest/${suppressedShareCheck.guestToken}/responses`, {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.120.${index + 1}` },
      body: JSON.stringify(payload)
    });
    assert(submitted.response.status === 201, `suppressed final-share setup response ${index + 1} failed`);
  }
  const suppressedThreeShare = await request(`/api/checks/host/${suppressedShareCheck.hostToken}/final-share`, {
    method: "POST"
  });
  assert(
    suppressedThreeShare.response.status === 409,
    `final share should reject 3-response suppressed results: ${suppressedThreeShare.response.status} ${JSON.stringify(suppressedThreeShare.body)}`
  );

  const malformed = await request(`/api/checks/guest/${guestToken}/responses`, {
    method: "POST",
    body: JSON.stringify({ status: "in", tierId: "missing", constraintIds: [] })
  });
  assert(malformed.response.status === 400, "malformed tier should be rejected");

  const firstResponse = await request(`/api/checks/guest/${guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.11" },
    body: JSON.stringify({
      status: "in",
      tierId: "easy_yes",
      constraintIds: ["budget-friendly"],
      privateNote: "This note must not be public",
      clientNonce: clientNonce("primary")
    })
  });
  assert(firstResponse.response.status === 201, "guest submit failed");
  assert(firstResponse.body.responseToken, "response token missing");

  const duplicateResponse = await request(`/api/checks/guest/${guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.11" },
    body: JSON.stringify({
      status: "in",
      tierId: "easy_yes",
      constraintIds: ["budget-friendly"],
      clientNonce: clientNonce("primary")
    })
  });
  assert(duplicateResponse.response.status === 409, "duplicate same-browser response should be rejected");
  const rotatedAgentDuplicate = await request(`/api/checks/guest/${guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.11", "user-agent": "rotated-abuse-agent" },
    body: JSON.stringify({
      status: "in",
      tierId: "easy_yes",
      constraintIds: ["budget-friendly"],
      clientNonce: clientNonce("primary")
    })
  });
  assert(rotatedAgentDuplicate.response.status === 409, "rotating user-agent should not bypass duplicate protection");
  const sameSourceCheck = await createCheck("home_chill", 61);
  const sameSourceFirst = await request(`/api/checks/guest/${sameSourceCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.88" },
    body: JSON.stringify({
      status: "in",
      tierId: "easy_yes",
      constraintIds: [],
      clientNonce: clientNonce("same-source-a")
    })
  });
  assert(sameSourceFirst.response.status === 201, "same-source first response should be accepted");
  const sameSourceSecond = await request(`/api/checks/guest/${sameSourceCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.88" },
    body: JSON.stringify({
      status: "maybe",
      tierId: "works_with_tweaks",
      constraintIds: [],
      clientNonce: clientNonce("same-source-b")
    })
  });
  assert(sameSourceSecond.response.status === 201, "different browser nonce from same source should be accepted");

  const parallelCheck = await createCheck("tickets_event", 62);
  const parallelResponses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      request(`/api/checks/guest/${parallelCheck.guestToken}/responses`, {
        method: "POST",
        headers: { "x-forwarded-for": `203.0.114.${index + 1}` },
        body: JSON.stringify({
          status: index % 3 === 0 ? "maybe" : "in",
          tierId: index % 3 === 0 ? "works_with_tweaks" : "easy_yes",
          constraintIds: [],
          clientNonce: clientNonce(`parallel-${index}`)
        })
      })
    )
  );
  const acceptedParallel = parallelResponses.filter((item) => item.response.status === 201).length;
  assert(acceptedParallel === 12, `parallel submissions should all be accepted: ${acceptedParallel}/12`);
  const parallelHost = await request(`/api/checks/host/${parallelCheck.hostToken}`);
  assert(
    parallelHost.body.result.responseCount === 12,
    `parallel accepted submissions should persist: ${parallelHost.body.result.responseCount}/12`
  );

  const edit = await request(`/api/responses/${firstResponse.body.responseToken}`, {
    method: "PUT",
    body: JSON.stringify({
      status: "maybe",
      tierId: "works_with_tweaks",
      constraintIds: ["budget-friendly"],
      privateNote: "Edited private note"
    })
  });
  assert(edit.response.ok, "guest edit failed");
  assert(!("response" in edit.body), "response update should not nest raw stored response");
  assert(!("responseTokenHash" in edit.body), "response update leaked response token hash");
  assert(!("clientFingerprintHash" in edit.body), "response update leaked legacy client fingerprint hash");
  assert(!("clientNonceHash" in edit.body), "response update leaked client nonce hash");
  assert(!("checkId" in edit.body), "response update leaked check id");

  for (const [index, payload] of [
    { status: "in", tierId: "easy_yes", constraintIds: ["budget-friendly"] },
    { status: "maybe", tierId: "works_with_tweaks", constraintIds: ["budget-friendly"] },
    { status: "out", tierId: "not_comfortable", constraintIds: ["budget-friendly", "easy-transit"] }
  ].entries()) {
    const submitted = await request(`/api/checks/guest/${guestToken}/responses`, {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${12 + index}` },
      body: JSON.stringify(payload)
    });
    assert(submitted.response.status === 201, `extra guest response failed: ${JSON.stringify(submitted.body)}`);
  }

  const host = await request(`/api/checks/host/${hostToken}`);
  assert(host.response.ok, "host results failed");
  assert(host.body.result.responseCount === 4, "host result count should be 4");
  assert(!host.body.result.isPrivacySuppressed, "host result should not be suppressed at 4");
  assert(host.body.result.groupedConstraints[0]?.label === "Keep the bill comfortable", "grouped budget constraint missing");
  assert(host.body.result.groupedConstraints[0]?.signal === "broad", "common constraint should surface qualitatively");
  assert(!("count" in host.body.result.groupedConstraints[0]), "grouped constraint leaked exact count");
  assert(!("share" in host.body.result.groupedConstraints[0]), "grouped constraint leaked exact share");
  assert(!JSON.stringify(host.body).includes("Edited private note"), "host result leaked private note");
  assert(!JSON.stringify(host.body.check).includes("TokenHash"), "host API leaked token hash");

  const withoutBudgetConstraint = await request(`/api/checks/host/${hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({
      constraints: host.body.check.draft.constraints.filter((constraint) => constraint.id !== "budget-friendly")
    })
  });
  assert(withoutBudgetConstraint.response.ok, "constraint delete failed");
  const afterConstraintDelete = await request(`/api/checks/host/${hostToken}`);
  assert(
    !JSON.stringify(afterConstraintDelete.body.result.groupedConstraints).includes("Other constraint"),
    "deleted constraint should not appear as Other constraint"
  );
  assert(
    !afterConstraintDelete.body.result.groupedConstraints.some((constraint) => constraint.id === "budget-friendly"),
    "deleted constraint should be removed from aggregates"
  );

  const finalShare = await request(`/api/checks/host/${hostToken}/final-share`, { method: "POST" });
  assert(finalShare.response.ok, "final share failed");
  assert(finalShare.body.resultUrl?.startsWith(`${baseUrl}/r/`), "final share result URL missing");

  const snapshot = await fetch(finalShare.body.resultUrl);
  const snapshotHtml = await snapshot.text();
  assert(snapshot.ok, `result snapshot did not open: ${snapshot.status} ${snapshotHtml.slice(0, 200)}`);
  assert(snapshotHtml.includes("Sayable public-safe result"), "snapshot content missing");
  assert(!snapshotHtml.includes("Edited private note"), "snapshot leaked private note");

  const longOgCheck = await createCheckWithOptions("birthday", {
    hostIndex: 64,
    title: "Birthday Dinner Group Decision With An Extremely Long Restaurant Name And Late-Night Dessert Plan"
  });
  for (const index of [0, 1, 2, 3]) {
    const submitted = await request(`/api/checks/guest/${longOgCheck.guestToken}/responses`, {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.116.${index + 1}` },
      body: JSON.stringify({
        status: "in",
        tierId: "easy_yes",
        constraintIds: ["budget-friendly"],
        clientNonce: clientNonce(`long-og-${index}`)
      })
    });
    assert(submitted.response.status === 201, `long OG setup response ${index + 1} failed`);
  }
  const longOgShare = await request(`/api/checks/host/${longOgCheck.hostToken}/final-share`, { method: "POST" });
  assert(longOgShare.response.ok, "long OG final share failed");
  const longOgToken = new URL(longOgShare.body.resultUrl).pathname.split("/").pop();
  const longOgImage = await fetch(`${baseUrl}/api/og/check/${longOgToken}`);
  const longOgSvg = await longOgImage.text();
  assert(longOgImage.ok, `long OG image failed: ${longOgImage.status}`);
  assert((longOgSvg.match(/<tspan/g) || []).length >= 4, "long OG image should wrap title/detail into bounded tspans");
  assert(!longOgSvg.includes('font-size="72"'), "long OG image should use reduced wrapped title sizing");

  const session = await demoSession();
  const claim = await request(`/api/checks/host/${hostToken}/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert(claim.response.ok, "claim failed");

  const forgedDashboard = await request("/api/dashboard", {
    headers: { Authorization: `Bearer ${forgeDemoToken(session.ownerUserId)}` }
  });
  assert(forgedDashboard.response.status === 401, "hard-coded demo auth secret should not forge dashboard access");

  const wrongSession = await demoSession();
  const wrongOwnerUpgrade = await request(`/api/checks/host/${hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${wrongSession.token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(wrongOwnerUpgrade.response.status === 403, "wrong owner upgrade should be rejected");

  const upgrade = await request(`/api/checks/host/${hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(upgrade.response.ok, "premium mock upgrade failed");

  const premiumHost = await request(`/api/checks/host/${hostToken}`);
  assert(premiumHost.body.check.plan === "premium", "premium plan not unlocked");
  assert(premiumHost.body.check.themeId === "dinner_drinks", "premium upgrade should apply activity theme default");

  const theme = await request(`/api/checks/host/${hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ themeId: "dinner_drinks", customTheme: { accent: "#b45132", icon: "glass" } })
  });
  assert(theme.response.ok, "premium theme/custom theme update failed");
  assert(theme.body.check.themeId === "dinner_drinks", "premium theme did not persist");
  assert(theme.body.check.customTheme?.icon === "glass", "custom icon did not persist");

  const preserveCheck = await createCheck("custom", 43);
  const preserveHost = await request(`/api/checks/host/${preserveCheck.hostToken}`);
  const preservePrompt = "CUSTOM PROMPT preserved through upgrade";
  const preserveConstraint = {
    id: "custom-preserve-upgrade",
    label: "Preserve this custom constraint",
    group: "custom",
    isCustom: true
  };
  const preserveEdit = await request(`/api/checks/host/${preserveCheck.hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({
      questions: [
        { ...preserveHost.body.check.draft.questions[0], prompt: preservePrompt },
        ...preserveHost.body.check.draft.questions.slice(1)
      ],
      constraints: [...preserveHost.body.check.draft.constraints, preserveConstraint]
    })
  });
  assert(preserveEdit.response.ok, "pre-upgrade draft edit failed");
  const preserveSession = await demoSession();
  const preserveClaim = await request(`/api/checks/host/${preserveCheck.hostToken}/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${preserveSession.token}` }
  });
  assert(preserveClaim.response.ok, "pre-upgrade preserve claim failed");
  const preserveUpgrade = await request(`/api/checks/host/${preserveCheck.hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${preserveSession.token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(preserveUpgrade.response.ok, "pre-upgrade preserve upgrade failed");
  const preserveAfter = await request(`/api/checks/host/${preserveCheck.hostToken}`);
  assert(
    preserveAfter.body.check.draft.questions[0].prompt === preservePrompt,
    "premium upgrade should preserve edited question prompt"
  );
  assert(
    preserveAfter.body.check.draft.constraints.some((constraint) => constraint.id === preserveConstraint.id),
    "premium upgrade should preserve custom constraints"
  );

  const dashboard = await request(`/api/dashboard?ownerUserId=demo_smoke_user`);
  assert(dashboard.response.status === 401, "dashboard should reject query-only owner access");

  const ownedDashboard = await request("/api/dashboard", {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert(ownedDashboard.response.ok, "dashboard failed");
  assert(
    ownedDashboard.body.checks.some((check) => check.title === "Smoke dinner_drinks"),
    "dashboard missing owned check"
  );

  const adminDenied = await request("/api/admin");
  assert(adminDenied.response.status === 401, "admin should require token");

  const adminInvalidAction = await request("/api/admin", {
    method: "POST",
    headers: { "x-sayable-admin-token": "smoke-admin-token" },
    body: JSON.stringify({ hostToken, action: "destroy" })
  });
  assert(adminInvalidAction.response.status === 400, "admin invalid action should be rejected");

  const adminMalformedJson = await request("/api/admin", {
    method: "POST",
    headers: { "x-sayable-admin-token": "smoke-admin-token" },
    body: "{"
  });
  assert(adminMalformedJson.response.status === 400, "admin malformed JSON should be rejected as bad request");

  const admin = await request("/api/admin", {
    headers: { "x-sayable-admin-token": "smoke-admin-token" }
  });
  assert(admin.response.ok, "admin with token failed");
  assert(admin.body.checks.length >= activityTypes.length, "admin checks missing");
  assert(admin.body.purchases.length >= 2, "admin purchases missing");

  const deleted = await request(`/api/responses/${firstResponse.body.responseToken}`, { method: "DELETE" });
  assert(deleted.response.ok, "guest delete failed");

  const deletedAgain = await request(`/api/responses/${firstResponse.body.responseToken}`, { method: "DELETE" });
  assert(deletedAgain.response.status === 404, "duplicate guest delete should be safe 404");

  const afterDelete = await request(`/api/checks/host/${hostToken}`);
  assert(afterDelete.body.result.responseCount === 3, "deleted response should reduce aggregate count");
  assert(afterDelete.body.result.isPrivacySuppressed, "deleting below threshold should re-suppress aggregates");
  const revokedSnapshot = await fetch(finalShare.body.resultUrl);
  assert(
    revokedSnapshot.status === 404,
    `deleted response should revoke old public snapshot: ${revokedSnapshot.status}`
  );

  const closedCheck = await createCheck("birthday", 40);
  const closedOwner = await demoSession();
  const closedClaim = await request(`/api/checks/host/${closedCheck.hostToken}/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${closedOwner.token}` }
  });
  assert(closedClaim.response.ok, "closed upgrade setup claim failed");
  const closed = await request(`/api/checks/host/${closedCheck.hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed" })
  });
  assert(closed.response.ok, "close check failed");
  const closedSubmit = await request(`/api/checks/guest/${closedCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.140" },
    body: JSON.stringify({ status: "in", tierId: "easy_yes", constraintIds: [] })
  });
  assert(closedSubmit.response.status === 410, "closed check should reject responses");
  const closedShare = await request(`/api/checks/host/${closedCheck.hostToken}/final-share`, { method: "POST" });
  assert(closedShare.response.status === 410, "closed check should reject final share");
  const closedUpgrade = await request(`/api/checks/host/${closedCheck.hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${closedOwner.token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(closedUpgrade.response.status === 410, "closed check should reject premium upgrade");

  const adminAfterSensitiveActions = await request("/api/admin", {
    headers: { "x-sayable-admin-token": "smoke-admin-token" }
  });
  const auditActions = adminAfterSensitiveActions.body.auditLogs.map((entry) => entry.action);
  for (const action of ["check_claimed", "premium_mock_checkout_completed", "response_deleted", "host_closed"]) {
    assert(auditActions.includes(action), `audit logs missing ${action}`);
  }

  const deletedCheck = await createCheck("home_chill", 41);
  const deletedCheckResponse = await request(`/api/checks/guest/${deletedCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.141" },
    body: JSON.stringify({
      status: "maybe",
      tierId: "works_with_tweaks",
      constraintIds: ["quiet-enough"],
      privateNote: "delete-check private note",
      clientNonce: clientNonce("delete-check")
    })
  });
  assert(deletedCheckResponse.response.status === 201, "delete-check response setup failed");
  const deletedPatch = await request(`/api/checks/host/${deletedCheck.hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "deleted" })
  });
  assert(deletedPatch.response.ok, `delete check failed: ${deletedPatch.response.status} ${JSON.stringify(deletedPatch.body)}`);
  const storeAfterCheckDelete = JSON.parse(readFileSync(storePath, "utf8"));
  const deletedCheckRecord = storeAfterCheckDelete.checks.find((check) => check.id === deletedPatch.body.check.id);
  const anonymizedResponses = storeAfterCheckDelete.responses.filter((response) => response.checkId === deletedPatch.body.check.id);
  assert(deletedCheckRecord?.status === "deleted", "deleted check status did not persist");
  assert(anonymizedResponses.length === 1, "delete-check response setup missing from store");
  assert(anonymizedResponses[0].deletedAt, "delete-check should mark associated response deleted");
  assert(!anonymizedResponses[0].privateNote, "delete-check should clear associated private note");
  assert(anonymizedResponses[0].constraintIds.length === 0, "delete-check should clear associated constraints");
  const deletedGuest = await request(`/api/checks/guest/${deletedCheck.guestToken}`);
  assert(deletedGuest.response.status === 410, "deleted guest link should show deleted state");
  const deletedHost = await request(`/api/checks/host/${deletedCheck.hostToken}`);
  assert(deletedHost.response.status === 410, "deleted host link should show deleted state");
  const resurrectDeleted = await request(`/api/checks/host/${deletedCheck.hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" })
  });
  assert(resurrectDeleted.response.status === 400 || resurrectDeleted.response.status === 410, "deleted check must not resurrect");
  const mutateDeleted = await request(`/api/checks/host/${deletedCheck.hostToken}`, {
    method: "PATCH",
    body: JSON.stringify({ resetDraft: true })
  });
  assert(mutateDeleted.response.status === 410, "deleted check must reject otherwise valid host edits");
  const stillDeletedGuest = await request(`/api/checks/guest/${deletedCheck.guestToken}`);
  assert(stillDeletedGuest.response.status === 410, "deleted guest link should stay deleted after resurrection attempt");

  const expiredCheck = await createCheck("group_trip", 42);
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  const record = store.checks.find((check) => check.hostTokenHash === store.checks.at(-1).hostTokenHash);
  record.expiresAt = "2000-01-01T00:00:00.000Z";
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  const expiredGuest = await request(`/api/checks/guest/${expiredCheck.guestToken}`);
  assert(expiredGuest.body.check.status === "expired", "expired guest link should show expired status");
  const expiredHost = await request(`/api/checks/host/${expiredCheck.hostToken}`);
  assert(expiredHost.body.check.status === "expired", "expired host link should show expired status");
  const expiredShare = await request(`/api/checks/host/${expiredCheck.hostToken}/final-share`, { method: "POST" });
  assert(expiredShare.response.status === 410, "expired check should reject final share");

  const ownerCapSession = await demoSession();
  const ownerCapStatuses = [];
  for (let index = 0; index < 4; index += 1) {
    const createdForOwner = await request("/api/checks", {
      method: "POST",
      headers: {
        "x-forwarded-for": `198.51.100.${70 + index}`,
        Authorization: `Bearer ${ownerCapSession.token}`
      },
      body: JSON.stringify({
        title: `Owner cap ${index + 1}`,
        activityType: "custom"
      })
    });
    ownerCapStatuses.push(createdForOwner.response.status);
  }
  assert(
    JSON.stringify(ownerCapStatuses) === JSON.stringify([201, 201, 201, 429]),
    `signed owner active cap failed: ${ownerCapStatuses.join(",")}`
  );
  const anonymousFourth = await createCheck("casual_hangout", 74);
  const fourthClaim = await request(`/api/checks/host/${anonymousFourth.hostToken}/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerCapSession.token}` }
  });
  assert(
    fourthClaim.response.status === 429,
    `signed owner claim cap should reject a fourth active free check: ${fourthClaim.response.status}`
  );

  const limitCheck = await createCheck("custom", 50);
  const created = [];
  for (let index = 0; index < 30; index += 1) {
    const submitted = await request(`/api/checks/guest/${limitCheck.guestToken}/responses`, {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${index + 1}` },
      body: JSON.stringify({ status: "in", tierId: "easy_yes", constraintIds: [] })
    });
    assert(submitted.response.status === 201, `free response ${index + 1} failed`);
    created.push(submitted.body.responseToken);
  }
  const cap = await request(`/api/checks/guest/${limitCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.99" },
    body: JSON.stringify({ status: "in", tierId: "easy_yes", constraintIds: [] })
  });
  assert(cap.response.status === 429, "31st free response should hit cap");

  const premiumLimitCheck = await createCheck("custom", 60);
  const premiumSession = await demoSession();
  const premiumClaim = await request(`/api/checks/host/${premiumLimitCheck.hostToken}/claim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${premiumSession.token}` }
  });
  assert(premiumClaim.response.ok, "premium limit claim failed");
  const premiumUpgrade = await request(`/api/checks/host/${premiumLimitCheck.hostToken}/upgrade`, {
    method: "POST",
    headers: { Authorization: `Bearer ${premiumSession.token}` },
    body: JSON.stringify({ outcome: "success" })
  });
  assert(premiumUpgrade.response.ok, "premium limit upgrade failed");
  for (let index = 0; index < 100; index += 1) {
    const submitted = await request(`/api/checks/guest/${premiumLimitCheck.guestToken}/responses`, {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.114.${index + 1}` },
      body: JSON.stringify({ status: "in", tierId: "easy_yes", constraintIds: [] })
    });
    assert(submitted.response.status === 201, `premium response ${index + 1} failed`);
  }
  const premiumCap = await request(`/api/checks/guest/${premiumLimitCheck.guestToken}/responses`, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.114.201" },
    body: JSON.stringify({ status: "in", tierId: "easy_yes", constraintIds: [] })
  });
  assert(premiumCap.response.status === 429, "101st premium response should hit cap");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        activityTypes: checks.length,
        responseCapChecked: true,
        premiumChecked: true,
        adminChecked: true,
        deletedResponsesChecked: true
      },
      null,
      2
    )
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null && !server.killed) {
    server.kill("SIGTERM");
  }
  await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5000))]);
  await rm(tempDir, { recursive: true, force: true });
}
