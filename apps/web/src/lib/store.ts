import "server-only";

import crypto from "node:crypto";
import {
  type ComfortConstraint,
  type ComfortDraft,
  type ComfortQuestion,
  type ComfortTier,
  calculateResultSummary,
  canUseTheme,
  createComfortDraft,
  getPlanLimits,
  THEMES
} from "@sayable/core";
import {
  decryptToken,
  encryptToken,
  hashToken,
  mutateStore,
  now,
  publicBaseUrl,
  randomToken,
  readStore,
  resetStoreForTests
} from "./store-backend";
import {
  type AuditLog,
  type CheckStatus,
  type CreateCheckInput,
  type HostVisibleCheck,
  type PurchaseRecord,
  type ResponseInput,
  type StoreFile,
  type StoredCheck,
  type StoredResponse,
  StoreError,
  type StoreErrorTelemetry
} from "./store-types";
import {
  requireCheckByToken,
  requireOwnerCheck,
  requireUsableCheck,
  tokenValidationFailure,
  visibleStatus
} from "./store-check-policy";

export { hashToken, publicBaseUrl, randomToken, StoreError };
export type {
  AuditLog,
  CheckStatus,
  CreateCheckInput,
  HostVisibleCheck,
  PurchaseRecord,
  ResponseInput,
  StoreErrorTelemetry,
  StoredCheck,
  StoredResponse
};
export {
  completePremiumCheckoutBySession,
  getPremiumCheckoutReturn,
  preflightPremiumCheckoutForTarget,
  startPremiumCheckoutForTarget,
  upgradeCheckForTarget
} from "./store-billing";
export type { PremiumCheckoutOutcome, PremiumCheckoutTarget } from "./store-billing";

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function activeResponsesFor(store: StoreFile, checkId: string): StoredResponse[] {
  return store.responses.filter((response) => response.checkId === checkId && !response.deletedAt);
}

function assertOwnerActiveFreeLimit(store: StoreFile, ownerUserId: string, excludingCheckId?: string): void {
  const activeForOwner = store.checks.filter(
    (check) =>
      check.id !== excludingCheckId &&
      check.ownerUserId === ownerUserId &&
      check.plan === "free" &&
      visibleStatus(check) === "active"
  ).length;
  if (activeForOwner >= getPlanLimits("free").maxActiveChecks) {
    throw new StoreError(429, "Free hosts can keep 3 active Comfort Checks at a time.");
  }
}

type HostAuthMode = "demo_feature_flag" | "supabase_oauth";

interface HostCommandContext {
  ownerUserId: string;
  actor: Extract<AuditLog["actor"], "demo_user" | "host">;
  mode: HostAuthMode;
}

type HostCheckPatch = {
  constraints?: ComfortConstraint[] | undefined;
  questions?: ComfortQuestion[] | undefined;
  tiers?: ComfortTier[] | undefined;
  resetDraft?: boolean | undefined;
  themeId?: string | undefined;
  customTheme?: { accent: string; icon: string } | undefined;
  resetCustomTheme?: boolean | undefined;
  status?: "closed" | "deleted" | undefined;
};

export function serializeHostCheck(check: StoredCheck): HostVisibleCheck {
  return {
    id: check.id,
    title: check.title,
    activityType: check.activityType,
    plan: check.plan,
    status: check.status,
    draft: check.draft,
    themeId: check.themeId,
    createdAt: check.createdAt,
    updatedAt: check.updatedAt,
    expiresAt: check.expiresAt,
    ...(check.customTheme ? { customTheme: check.customTheme } : {}),
    ...(check.ownerUserId ? { ownerUserId: check.ownerUserId } : {}),
    ...(check.finalSharedAt ? { finalSharedAt: check.finalSharedAt } : {})
  };
}

export function logAnalytics(
  name: string,
  context: Record<string, string | number | boolean | null> = {},
  checkId?: string
): void {
  void mutateStore((store) => {
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name,
      ...(checkId ? { checkId } : {}),
      createdAt: now(),
      context
    });
  }).catch((error) => console.error("Sayable analytics log failed", error));
}

export function logAudit(action: string, detail: string, actor: AuditLog["actor"], checkId?: string): void {
  void mutateStore((store) => {
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action,
      ...(checkId ? { checkId } : {}),
      createdAt: now(),
      actor,
      detail
    });
  }).catch((error) => console.error("Sayable audit log failed", error));
}

export function logAbuse(route: string, reason: string, fingerprintHash: string): void {
  void mutateStore((store) => {
    store.abuseEvents.push({
      id: crypto.randomUUID(),
      route,
      reason,
      fingerprintHash,
      createdAt: now()
    });
  }).catch((error) => console.error("Sayable abuse log failed", error));
}

export async function createCheck(
  input: CreateCheckInput,
  createdByFingerprintHash?: string,
  hostContext?: HostCommandContext
): Promise<{
  check: StoredCheck;
  guestToken: string;
  hostToken: string;
}> {
  return mutateStore((store) => {
    const freeActiveLimit = getPlanLimits("free").maxActiveChecks;
    if (hostContext) {
      assertOwnerActiveFreeLimit(store, hostContext.ownerUserId);
    }
    if (createdByFingerprintHash) {
      const activeForFingerprint = store.checks.filter(
        (check) =>
          check.createdByFingerprintHash === createdByFingerprintHash &&
          visibleStatus(check) === "active" &&
          check.plan === "free"
      ).length;
      if (activeForFingerprint >= freeActiveLimit) {
        throw new StoreError(429, "Free hosts can keep 3 active Comfort Checks at a time.");
      }
    }
    const guestToken = randomToken();
    const hostToken = randomToken();
    const draft = createComfortDraft(input, "free");
    const createdAt = now();
    const check: StoredCheck = {
      id: crypto.randomUUID(),
      title: draft.title,
      activityType: input.activityType,
      plan: "free",
      status: "active",
      draft,
      themeId: "sayable_default",
      createdAt,
      updatedAt: createdAt,
      expiresAt: addDays(new Date(createdAt), getPlanLimits("free").retentionDays),
      guestTokenCiphertext: encryptToken(guestToken),
      guestTokenHash: hashToken(guestToken),
      hostTokenHash: hashToken(hostToken),
      resultTokenHash: hashToken(randomToken()),
      ...(hostContext ? { ownerUserId: hostContext.ownerUserId } : {}),
      ...(createdByFingerprintHash ? { createdByFingerprintHash } : {})
    };
    store.checks.push(check);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "check_created",
      checkId: check.id,
      createdAt,
      context: { activityType: input.activityType, plan: "free" }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "check_created",
      checkId: check.id,
      createdAt,
      actor: hostContext?.actor || "anonymous",
      detail: hostContext ? "Signed host created a Comfort Check." : "Token-created check created without account."
    });
    return { check, guestToken, hostToken };
  });
}

function hostCheckPayload(store: StoreFile, check: StoredCheck) {
  if (check.status === "deleted") {
    throw new StoreError(410, "This Comfort Check has been deleted.");
  }
  const visibleCheck = { ...check, status: visibleStatus(check) };
  const responses = store.responses.filter((response) => response.checkId === check.id);
  const active = responses.filter((response) => !response.deletedAt);
  const result = calculateResultSummary(check.draft, responses);
  return {
    check: visibleCheck,
    responseCount: active.length,
    deletedResponseCount: responses.length - active.length,
    result,
    guestUrl: `${publicBaseUrl()}/c/${decryptToken(check.guestTokenCiphertext)}`,
    hasOwner: Boolean(check.ownerUserId)
  };
}

export async function getPublicCheck(guestToken: string) {
  const store = await readStore();
  const check = requireCheckByToken(store, guestToken, "guestTokenHash", "guest", "Comfort Check not found.");
  if (check.status === "deleted") {
    throw new StoreError(410, "This Comfort Check has been deleted.");
  }
  return {
    check: { ...check, status: visibleStatus(check) },
    responseCount: activeResponsesFor(store, check.id).length
  };
}

export async function getHostCheck(hostToken: string) {
  const store = await readStore();
  const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
  return hostCheckPayload(store, check);
}

export async function getHostCheckForApi(hostToken: string) {
  const store = await readStore();
  const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
  if (check.status === "deleted") {
    throw new StoreError(410, "This Comfort Check has been deleted.");
  }
  const responses = store.responses.filter((response) => response.checkId === check.id);
  return {
    check,
    responses,
    result: calculateResultSummary(check.draft, responses)
  };
}

export async function getOwnerCheck(checkId: string, ownerUserId: string) {
  const store = await readStore();
  return hostCheckPayload(store, requireOwnerCheck(store, checkId, ownerUserId));
}

export async function getSnapshot(resultToken: string) {
  const store = await readStore();
  const tokenHash = hashToken(resultToken);
  const snapshot = store.resultSnapshots.find(
    (candidate) => candidate.resultTokenHash === tokenHash && !candidate.deletedAt
  );
  if (!snapshot) {
    tokenValidationFailure(store, "result", resultToken, 404, "Result snapshot not found.");
  }
  const check = store.checks.find((candidate) => candidate.id === snapshot.checkId);
  if (!check || check.status === "deleted") {
    throw new StoreError(404, "Result snapshot not found.");
  }
  return {
    check,
    result: {
      publicSnapshot: snapshot.snapshot
    }
  };
}

export async function getPreviewByToken(token: string) {
  const store = await readStore();
  const tokenHash = hashToken(token);
  const guestCheck = store.checks.find((candidate) => candidate.guestTokenHash === tokenHash);
  if (guestCheck) {
    return { kind: "guest" as const, check: guestCheck };
  }
  const snapshot = store.resultSnapshots.find(
    (candidate) => candidate.resultTokenHash === tokenHash && !candidate.deletedAt
  );
  if (snapshot) {
    const check = store.checks.find((candidate) => candidate.id === snapshot.checkId);
    if (check && check.status !== "deleted") {
      return {
        kind: "result" as const,
        check,
        result: { publicSnapshot: snapshot.snapshot }
      };
    }
  }
  throw new StoreError(404, "Preview not found.");
}

export function submitResponse(
  guestToken: string,
  input: ResponseInput,
  clientNonceHash: string
): Promise<{ response: StoredResponse; responseToken: string; check: StoredCheck }> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, guestToken, "guestTokenHash", "guest", "Comfort Check not found.");
    requireUsableCheck(check);

    const activeCount = activeResponsesFor(store, check.id).length;
    const limit = getPlanLimits(check.plan).maxResponsesPerCheck;
    if (activeCount >= limit) {
      throw new StoreError(429, `This ${check.plan} Comfort Check has reached its ${limit}-response limit.`);
    }
    validateResponseInput(check.draft, input);
    const duplicate = store.responses.find(
      (response) =>
        response.checkId === check.id &&
        response.clientNonceHash === clientNonceHash &&
        !response.deletedAt
    );
    if (duplicate) {
      throw new StoreError(409, "You already responded from this browser. Use your response link to edit.");
    }

    const token = randomToken();
    const createdAt = now();
    const response: StoredResponse = {
      id: crypto.randomUUID(),
      checkId: check.id,
      responseTokenHash: hashToken(token),
      status: input.status,
      tierId: input.tierId,
      constraintIds: uniqueKnownConstraintIds(check.draft, input.constraintIds),
      createdAt,
      updatedAt: createdAt,
      clientNonceHash,
      ...(input.privateNote?.trim() ? { privateNote: input.privateNote.trim().slice(0, 500) } : {})
    };
    store.responses.push(response);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "guest_response_submitted",
      checkId: check.id,
      createdAt,
      context: { status: input.status }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "response_submitted",
      checkId: check.id,
      createdAt,
      actor: "guest",
      detail: "Guest response submitted with response token."
    });
    return { response, responseToken: token, check };
  });
}

export async function getResponse(responseToken: string): Promise<StoredResponse> {
  const store = await readStore();
  const response = store.responses.find((candidate) => candidate.responseTokenHash === hashToken(responseToken));
  if (!response || response.deletedAt) {
    tokenValidationFailure(store, "response", responseToken, 404, "Response token not found.");
  }
  return response;
}

export function updateResponse(responseToken: string, input: ResponseInput): Promise<StoredResponse> {
  return mutateStore((store) => {
    const response = store.responses.find((candidate) => candidate.responseTokenHash === hashToken(responseToken));
    if (!response || response.deletedAt) {
      tokenValidationFailure(store, "response", responseToken, 404, "Response token not found.");
    }
    const check = store.checks.find((candidate) => candidate.id === response.checkId);
    if (!check) {
      throw new StoreError(404, "Comfort Check not found.");
    }
    requireUsableCheck(check);
    validateResponseInput(check.draft, input);
    response.status = input.status;
    response.tierId = input.tierId;
    response.constraintIds = uniqueKnownConstraintIds(check.draft, input.constraintIds);
    response.updatedAt = now();
    if (input.privateNote?.trim()) {
      response.privateNote = input.privateNote.trim().slice(0, 500);
    } else {
      delete response.privateNote;
    }
    invalidateResultSnapshots(store, check.id, response.updatedAt);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "guest_response_edited",
      checkId: check.id,
      createdAt: response.updatedAt,
      context: { status: input.status }
    });
    return response;
  });
}

export function deleteResponse(responseToken: string): Promise<StoredResponse> {
  return mutateStore((store) => {
    const response = store.responses.find((candidate) => candidate.responseTokenHash === hashToken(responseToken));
    if (!response || response.deletedAt) {
      tokenValidationFailure(store, "response", responseToken, 404, "Response token not found or already deleted.");
    }
    const deletedAt = now();
    response.deletedAt = deletedAt;
    response.updatedAt = deletedAt;
    response.constraintIds = [];
    delete response.privateNote;
    invalidateResultSnapshots(store, response.checkId, deletedAt);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "guest_response_deleted",
      checkId: response.checkId,
      createdAt: deletedAt,
      context: {}
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "response_deleted",
      checkId: response.checkId,
      createdAt: deletedAt,
      actor: "guest",
      detail: "Guest response deleted with response token."
    });
    return response;
  });
}

function validateResponseInput(draft: ComfortDraft, input: ResponseInput): void {
  if (!["in", "maybe", "out"].includes(input.status)) {
    throw new StoreError(400, "Choose in, maybe, or out.");
  }
  if (!draft.tiers.some((tier) => tier.id === input.tierId)) {
    throw new StoreError(400, "Choose a valid comfort tier.");
  }
  if (input.privateNote && input.privateNote.length > 500) {
    throw new StoreError(400, "Private note is too long.");
  }
}

function uniqueKnownConstraintIds(draft: ComfortDraft, ids: string[]): string[] {
  const allowed = new Set(draft.constraints.map((constraint) => constraint.id));
  return Array.from(new Set(ids)).filter((id) => allowed.has(id)).slice(0, 10);
}

function constraintLabelKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function invalidateResultSnapshots(store: StoreFile, checkId: string, deletedAt: string): void {
  for (const snapshot of store.resultSnapshots.filter((candidate) => candidate.checkId === checkId && !candidate.deletedAt)) {
    snapshot.deletedAt = deletedAt;
  }
}

function anonymizeResponsesForCheck(store: StoreFile, checkId: string, deletedAt: string): void {
  for (const response of store.responses.filter((candidate) => candidate.checkId === checkId)) {
    response.deletedAt = response.deletedAt || deletedAt;
    response.updatedAt = deletedAt;
    response.constraintIds = [];
    delete response.privateNote;
  }
  invalidateResultSnapshots(store, checkId, deletedAt);
}

function applyHostCheckPatch(store: StoreFile, check: StoredCheck, patch: HostCheckPatch): StoredCheck {
  if (check.status === "deleted") {
    const isIdempotentDelete =
      patch.status === "deleted" &&
      !patch.constraints &&
      !patch.questions &&
      !patch.tiers &&
      !patch.resetDraft &&
      !patch.themeId &&
      !patch.customTheme &&
      !patch.resetCustomTheme;
    if (isIdempotentDelete) {
      return check;
    }
    throw new StoreError(410, "This Comfort Check has been deleted.");
  }
  if (patch.resetDraft) {
    check.draft = createComfortDraft(
      {
        title: check.draft.title,
        activityType: check.activityType,
        ...(check.draft.currentIdea ? { currentIdea: check.draft.currentIdea } : {}),
        ...(check.draft.vibe ? { vibe: check.draft.vibe } : {})
      },
      check.plan
    );
  }
  if (patch.constraints) {
    const maxCustom = getPlanLimits(check.plan).maxCustomConstraints;
    const existing = new Map(check.draft.constraints.map((constraint) => [constraint.id, constraint]));
    const seenIds = new Set<string>();
    const seenCustomLabels = new Set<string>();
    const normalized = patch.constraints.map((constraint) => {
      const previous = existing.get(constraint.id);
      const label = constraint.label.trim().slice(0, 100);
      if (!label) {
        throw new StoreError(400, "Constraint labels cannot be empty.");
      }
      if (seenIds.has(constraint.id)) {
        throw new StoreError(400, "Constraint ids must be unique.");
      }
      seenIds.add(constraint.id);
      const isCustom = Boolean(
        previous?.isCustom || previous?.group === "custom" || constraint.isCustom || constraint.group === "custom"
      );
      if (isCustom) {
        const key = constraintLabelKey(label);
        if (seenCustomLabels.has(key)) {
          throw new StoreError(400, "Custom constraint labels must be unique.");
        }
        seenCustomLabels.add(key);
      }
      if (previous) {
        return {
          ...previous,
          label
        };
      }
      if (constraint.group !== "custom" && !constraint.isCustom) {
        throw new StoreError(400, "New constraints must be custom constraints.");
      }
      return {
        id: constraint.id,
        label,
        group: "custom" as const,
        isCustom: true
      };
    });
    const customCount = normalized.filter((constraint) => constraint.isCustom || constraint.group === "custom").length;
    if (customCount > maxCustom) {
      throw new StoreError(400, `${check.plan} checks allow ${maxCustom} custom constraints.`);
    }
    check.draft.constraints = normalized.slice(0, check.plan === "premium" ? 16 : 8);
  }
  if (patch.questions) {
    check.draft.questions = patch.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt.trim().slice(0, 140),
      helper: question.helper.trim().slice(0, 220)
    }));
  }
  if (patch.tiers) {
    check.draft.tiers = patch.tiers.map((tier) => ({
      id: tier.id,
      label: tier.label.trim().slice(0, 80),
      description: tier.description.trim().slice(0, 180),
      score: Math.max(0, Math.min(3, tier.score))
    }));
  }
  if (patch.themeId) {
    if (!THEMES.some((theme) => theme.id === patch.themeId)) {
      throw new StoreError(400, "Choose a valid Sayable theme.");
    }
    if (!canUseTheme(check.plan, patch.themeId)) {
      throw new StoreError(402, "Upgrade to Premium Check to use that theme.");
    }
    check.themeId = patch.themeId;
  }
  if (patch.customTheme) {
    if (check.plan !== "premium") {
      throw new StoreError(402, "Custom color and icon require Premium Check.");
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(patch.customTheme.accent)) {
      throw new StoreError(400, "Choose a valid custom color.");
    }
    if (!/^[a-z0-9_-]{1,16}$/i.test(patch.customTheme.icon)) {
      throw new StoreError(400, "Choose a valid custom icon name.");
    }
    check.customTheme = {
      accent: patch.customTheme.accent,
      icon: patch.customTheme.icon.slice(0, 16)
    };
  }
  if (patch.resetCustomTheme) {
    delete check.customTheme;
  }
  if (patch.status) {
    const statusChangedAt = now();
    check.status = patch.status;
    if (patch.status === "deleted") {
      anonymizeResponsesForCheck(store, check.id, statusChangedAt);
    }
    if (patch.status === "closed" || patch.status === "deleted") {
      store.auditLogs.push({
        id: crypto.randomUUID(),
        action: `host_${patch.status}`,
        checkId: check.id,
        createdAt: statusChangedAt,
        actor: "host",
        detail: `Host token ${patch.status} Comfort Check.`
      });
    }
  }
  check.updatedAt = now();
  store.analyticsEvents.push({
    id: crypto.randomUUID(),
    name: patch.resetDraft ? "auto_draft_reset" : "check_updated",
    checkId: check.id,
    createdAt: check.updatedAt,
    context: { plan: check.plan }
  });
  return check;
}

export function updateHostCheck(hostToken: string, patch: HostCheckPatch): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
    return applyHostCheckPatch(store, check, patch);
  });
}

export function updateOwnerCheck(checkId: string, ownerUserId: string, patch: HostCheckPatch): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = requireOwnerCheck(store, checkId, ownerUserId);
    return applyHostCheckPatch(store, check, patch);
  });
}

export function claimCheck(
  hostToken: string,
  ownerUserId: string,
  actor: AuditLog["actor"] = "host",
  mode: "demo_feature_flag" | "supabase_oauth" = "supabase_oauth"
): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
    if (check.ownerUserId && check.ownerUserId !== ownerUserId) {
      throw new StoreError(403, "This Comfort Check is already saved to another account.");
    }
    if (check.plan === "free" && visibleStatus(check) === "active") {
      assertOwnerActiveFreeLimit(store, ownerUserId, check.id);
    }
    check.ownerUserId = ownerUserId;
    check.updatedAt = now();
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "google_sign_in_completed",
      checkId: check.id,
      createdAt: check.updatedAt,
      context: { mode }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "check_claimed",
      checkId: check.id,
      createdAt: check.updatedAt,
      actor,
      detail: mode === "demo_feature_flag"
        ? "Token-created check claimed into signed demo auth session."
        : "Token-created check claimed into Supabase Auth host account."
    });
    return check;
  });
}

export async function listChecksForOwner(ownerUserId: string): Promise<StoredCheck[]> {
  const store = await readStore();
  return store.checks
    .filter((check) => check.ownerUserId === ownerUserId && check.status !== "deleted")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteOwnerAccount(
  ownerUserId: string,
  actor: Extract<AuditLog["actor"], "demo_user" | "host"> = "host"
): Promise<{ deletedChecks: number }> {
  return mutateStore((store) => {
    const deletedAt = now();
    let deletedChecks = 0;
    for (const check of store.checks.filter((candidate) => candidate.ownerUserId === ownerUserId && candidate.status !== "deleted")) {
      check.status = "deleted";
      check.updatedAt = deletedAt;
      anonymizeResponsesForCheck(store, check.id, deletedAt);
      store.auditLogs.push({
        id: crypto.randomUUID(),
        action: "account_check_deleted",
        checkId: check.id,
        createdAt: deletedAt,
        actor,
        detail: "Signed host account deletion deleted an owned Comfort Check."
      });
      deletedChecks += 1;
    }
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "account_deleted",
      createdAt: deletedAt,
      actor,
      detail: "Signed host requested account deletion; owned Comfort Checks were deleted."
    });
    return { deletedChecks };
  });
}

function markFinalSharedForCheckRecord(store: StoreFile, check: StoredCheck): {
  check: StoredCheck;
  resultToken: string;
  finalMessage: string;
} {
  requireUsableCheck(check);
  const responses = store.responses.filter((response) => response.checkId === check.id);
  const result = calculateResultSummary(check.draft, responses);
  if (result.isPrivacySuppressed) {
    throw new StoreError(409, `Final share is available after ${result.privacyThreshold} private responses.`);
  }
  const resultToken = randomToken();
  check.resultTokenHash = hashToken(resultToken);
  check.finalSharedAt = now();
  check.updatedAt = check.finalSharedAt;
  store.analyticsEvents.push({
    id: crypto.randomUUID(),
    name: "final_share_generated",
    checkId: check.id,
    createdAt: check.finalSharedAt,
    context: {}
  });
  store.resultSnapshots.push({
    id: crypto.randomUUID(),
    checkId: check.id,
    resultTokenHash: check.resultTokenHash,
    snapshot: result.publicSnapshot,
    createdAt: check.finalSharedAt
  });
  return { check, resultToken, finalMessage: result.finalMessage };
}

export function markFinalShared(hostToken: string): Promise<{
  check: StoredCheck;
  resultToken: string;
  finalMessage: string;
}> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
    return markFinalSharedForCheckRecord(store, check);
  });
}

export function markFinalSharedForOwner(checkId: string, ownerUserId: string): Promise<{
  check: StoredCheck;
  resultToken: string;
  finalMessage: string;
}> {
  return mutateStore((store) => {
    const check = requireOwnerCheck(store, checkId, ownerUserId);
    return markFinalSharedForCheckRecord(store, check);
  });
}

export function adminUpdateCheckById(checkId: string, status: "closed" | "deleted"): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = store.checks.find((candidate) => candidate.id === checkId);
    if (!check) {
      throw new StoreError(404, "Comfort Check not found.");
    }
    const updatedAt = now();
    check.status = status;
    check.updatedAt = updatedAt;
    if (status === "deleted") {
      anonymizeResponsesForCheck(store, check.id, updatedAt);
    }
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: `admin_${status === "closed" ? "close" : "delete"}`,
      checkId: check.id,
      createdAt: updatedAt,
      actor: "admin",
      detail: `Admin operator ${status === "closed" ? "closed" : "deleted"} Comfort Check by check id.`
    });
    return check;
  });
}

export async function adminSnapshot() {
  const store = await readStore();
  return {
    checks: store.checks.map((check) => ({
      id: check.id,
      title: check.title,
      activityType: check.activityType,
      plan: check.plan,
      status: check.status,
      responseCount: activeResponsesFor(store, check.id).length,
      createdAt: check.createdAt,
      updatedAt: check.updatedAt,
      ownerUserId: check.ownerUserId ?? null
    })),
    responses: store.responses.slice(-100).map((response) => ({
      checkId: response.checkId,
      status: response.status,
      tierId: response.tierId,
      constraintCount: response.constraintIds.length,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      deletedAt: response.deletedAt ?? null
    })),
    purchases: store.purchases,
    abuseEvents: store.abuseEvents.slice(-50),
    auditLogs: store.auditLogs.slice(-100),
    analyticsEvents: store.analyticsEvents.slice(-100)
  };
}

export async function resetLocalStoreForTests(): Promise<void> {
  await resetStoreForTests();
}
