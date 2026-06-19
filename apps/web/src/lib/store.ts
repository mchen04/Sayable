import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type ActivityType,
  calculateResultSummary,
  canUseTheme,
  createComfortDraft,
  defaultThemeForActivity,
  getPlanLimits,
  THEMES,
  type ComfortConstraint,
  type ComfortDraft,
  type ComfortQuestion,
  type ComfortTier,
  type GuestResponse,
  type PlanTier,
  type ResponseStatus,
  type Vibe
} from "@sayable/core";

export type CheckStatus = "active" | "closed" | "deleted" | "expired";

export interface StoredCheck {
  id: string;
  title: string;
  activityType: ActivityType;
  plan: PlanTier;
  status: CheckStatus;
  draft: ComfortDraft;
  themeId: string;
  customTheme?: {
    accent: string;
    icon: string;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  guestTokenCiphertext: string;
  guestTokenHash: string;
  hostTokenHash: string;
  resultTokenHash: string;
  createdByFingerprintHash?: string;
  ownerUserId?: string;
  finalSharedAt?: string;
}

export type HostVisibleCheck = Pick<
  StoredCheck,
  | "id"
  | "title"
  | "activityType"
  | "plan"
  | "status"
  | "draft"
  | "themeId"
  | "createdAt"
  | "updatedAt"
  | "expiresAt"
  | "ownerUserId"
  | "finalSharedAt"
> & {
  customTheme?: StoredCheck["customTheme"];
};

export interface StoredResponse extends GuestResponse {
  id: string;
  checkId: string;
  responseTokenHash: string;
  clientNonceHash?: string;
}

export interface PurchaseRecord {
  id: string;
  checkId: string;
  productType: "premium_check_upgrade";
  amountCents: 499;
  mode: "mock" | "test";
  status: "completed" | "failed" | "cancelled";
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  name: string;
  checkId?: string;
  createdAt: string;
  context: Record<string, string | number | boolean | null>;
}

export interface AuditLog {
  id: string;
  action: string;
  checkId?: string;
  createdAt: string;
  actor: "anonymous" | "host" | "guest" | "demo_user" | "admin";
  detail: string;
}

export interface AbuseEvent {
  id: string;
  route: string;
  reason: string;
  fingerprintHash: string;
  createdAt: string;
}

export interface StoredResultSnapshot {
  id: string;
  checkId: string;
  resultTokenHash: string;
  snapshot: {
    headline: string;
    detail: string;
    safeStats: string[];
  };
  createdAt: string;
  deletedAt?: string;
}

interface StoreFile {
  checks: StoredCheck[];
  responses: StoredResponse[];
  purchases: PurchaseRecord[];
  analyticsEvents: AnalyticsEvent[];
  auditLogs: AuditLog[];
  abuseEvents: AbuseEvent[];
  resultSnapshots: StoredResultSnapshot[];
}

export interface CreateCheckInput {
  title: string;
  activityType: ActivityType;
  currentIdea?: string | undefined;
  vibe?: Vibe | undefined;
  customConstraints?: string[] | undefined;
}

export interface ResponseInput {
  status: ResponseStatus;
  tierId: string;
  constraintIds: string[];
  privateNote?: string | undefined;
  clientNonce?: string | undefined;
}

function resolveStorePath(): string {
  const configuredPath = process.env.SAYABLE_STORE_PATH;
  if (configuredPath) {
    return configuredPath;
  }
  return path.join(process.cwd(), ".sayable-data", "store.json");
}

const STORE_PATH = resolveStorePath();
let supabaseStoreClient: SupabaseClient | undefined;
let supabaseRealtimeClient: SupabaseClient | undefined;
let storeMutationQueue: Promise<void> = Promise.resolve();
const SUPABASE_STORE_LOCK_KEY = "sayable_runtime_store";

declare global {
  var __sayableTokenEncryptionSecret: string | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function tokenEncryptionSecret(): string {
  if (process.env.SAYABLE_TOKEN_ENCRYPTION_KEY) {
    return process.env.SAYABLE_TOKEN_ENCRYPTION_KEY;
  }
  if (isSupabaseStoreEnabled()) {
    throw new StoreError(500, "Supabase store backend requires SAYABLE_TOKEN_ENCRYPTION_KEY.");
  }
  if (globalThis.__sayableTokenEncryptionSecret) {
    return globalThis.__sayableTokenEncryptionSecret;
  }
  const keyPath = `${STORE_PATH}.key`;
  if (fs.existsSync(keyPath)) {
    globalThis.__sayableTokenEncryptionSecret = fs.readFileSync(keyPath, "utf8").trim();
    return globalThis.__sayableTokenEncryptionSecret;
  }
  globalThis.__sayableTokenEncryptionSecret = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, `${globalThis.__sayableTokenEncryptionSecret}\n`, { mode: 0o600 });
  return globalThis.__sayableTokenEncryptionSecret;
}

function tokenEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(tokenEncryptionSecret()).digest();
}

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(ciphertext: string): string {
  const [version, iv, tag, encrypted] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new StoreError(500, "Guest share link material is unavailable.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function blankStore(): StoreFile {
  return {
    checks: [],
    responses: [],
    purchases: [],
    analyticsEvents: [],
    auditLogs: [],
    abuseEvents: [],
    resultSnapshots: []
  };
}

function normalizeStoredCheck(check: StoredCheck & { guestToken?: string }): StoredCheck {
  if (check.guestTokenCiphertext) {
    return check;
  }
  if (check.guestToken) {
    const { guestToken: _guestToken, ...rest } = check;
    return {
      ...rest,
      guestTokenCiphertext: encryptToken(_guestToken),
      guestTokenHash: check.guestTokenHash || hashToken(_guestToken)
    };
  }
  return check;
}

function readFileStore(): StoreFile {
  if (!fs.existsSync(STORE_PATH)) {
    return blankStore();
  }
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  if (!raw.trim()) {
    return blankStore();
  }
  const parsed = JSON.parse(raw) as Partial<StoreFile>;
  return {
    checks: (parsed.checks || []).map(normalizeStoredCheck),
    responses: parsed.responses || [],
    purchases: parsed.purchases || [],
    analyticsEvents: parsed.analyticsEvents || [],
    auditLogs: parsed.auditLogs || [],
    abuseEvents: parsed.abuseEvents || [],
    resultSnapshots: parsed.resultSnapshots || []
  };
}

function writeFileStore(store: StoreFile): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function isSupabaseStoreEnabled(): boolean {
  return process.env.SAYABLE_STORE_BACKEND === "supabase";
}

function getSupabaseStoreClient(): SupabaseClient {
  if (supabaseStoreClient) {
    return supabaseStoreClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SAYABLE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StoreError(500, "Supabase store backend requires NEXT_PUBLIC_SUPABASE_URL and SAYABLE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  supabaseStoreClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return supabaseStoreClient;
}

function getSupabaseRealtimeClient(): SupabaseClient | null {
  if (supabaseRealtimeClient) {
    return supabaseRealtimeClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SAYABLE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  supabaseRealtimeClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return supabaseRealtimeClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSupabaseStoreLock(): Promise<string | undefined> {
  if (!isSupabaseStoreEnabled()) {
    return undefined;
  }
  const ownerId = `${process.pid}-${crypto.randomUUID()}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { data, error } = await getSupabaseStoreClient().rpc("try_acquire_sayable_store_lock", {
      p_lock_key: SUPABASE_STORE_LOCK_KEY,
      p_owner_id: ownerId,
      p_ttl_seconds: 20
    });
    if (error) {
      throwSupabaseError(error, "acquire runtime lock");
    }
    if (data === true) {
      return ownerId;
    }
    await sleep(80);
  }
  throw new StoreError(503, "Sayable is busy saving recent changes. Try again.");
}

async function releaseSupabaseStoreLock(ownerId: string | undefined): Promise<void> {
  if (!ownerId || !isSupabaseStoreEnabled()) {
    return;
  }
  const { error } = await getSupabaseStoreClient().rpc("release_sayable_store_lock", {
    p_lock_key: SUPABASE_STORE_LOCK_KEY,
    p_owner_id: ownerId
  });
  if (error) {
    console.error("Sayable Supabase store release runtime lock failed", error);
  }
}

interface ComfortCheckRow {
  id: string;
  owner_user_id: string | null;
  title: string;
  activity_type: ActivityType;
  plan: PlanTier;
  status: CheckStatus;
  draft: ComfortDraft;
  theme_id: string;
  custom_theme: StoredCheck["customTheme"] | null;
  guest_token_ciphertext: string;
  guest_token_hash: string;
  host_token_hash: string;
  result_token_hash: string;
  created_by_fingerprint_hash: string | null;
  expires_at: string;
  final_shared_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResponseRow {
  id: string;
  check_id: string;
  response_token_hash: string;
  status: ResponseStatus;
  tier_id: string;
  constraint_ids: string[];
  private_note: string | null;
  client_nonce_hash: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface PurchaseRow {
  id: string;
  check_id: string;
  product_type: "premium_check_upgrade";
  amount_cents: 499;
  mode: "mock" | "test";
  status: "completed" | "failed" | "cancelled";
  created_at: string;
}

interface AnalyticsRow {
  id: string;
  check_id: string | null;
  event_name: string;
  context: Record<string, string | number | boolean | null>;
  created_at: string;
}

interface AuditRow {
  id: string;
  check_id: string | null;
  actor_type: AuditLog["actor"];
  action: string;
  detail: string;
  created_at: string;
}

interface AbuseRow {
  id: string;
  route: string;
  reason: string;
  fingerprint_hash: string;
  created_at: string;
}

interface SnapshotRow {
  id: string;
  check_id: string;
  result_token_hash: string;
  snapshot: StoredResultSnapshot["snapshot"];
  created_at: string;
  deleted_at: string | null;
}

function mapCheckRow(row: ComfortCheckRow): StoredCheck {
  return {
    id: row.id,
    title: row.title,
    activityType: row.activity_type,
    plan: row.plan,
    status: row.status,
    draft: row.draft,
    themeId: row.theme_id,
    ...(row.custom_theme ? { customTheme: row.custom_theme } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    guestTokenCiphertext: row.guest_token_ciphertext,
    guestTokenHash: row.guest_token_hash,
    hostTokenHash: row.host_token_hash,
    resultTokenHash: row.result_token_hash,
    ...(row.created_by_fingerprint_hash ? { createdByFingerprintHash: row.created_by_fingerprint_hash } : {}),
    ...(row.owner_user_id ? { ownerUserId: row.owner_user_id } : {}),
    ...(row.final_shared_at ? { finalSharedAt: row.final_shared_at } : {})
  };
}

function mapResponseRow(row: ResponseRow): StoredResponse {
  return {
    id: row.id,
    checkId: row.check_id,
    responseTokenHash: row.response_token_hash,
    status: row.status,
    tierId: row.tier_id,
    constraintIds: row.constraint_ids,
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    ...(row.private_note ? { privateNote: row.private_note } : {}),
    ...(row.client_nonce_hash ? { clientNonceHash: row.client_nonce_hash } : {})
  };
}

function throwSupabaseError(error: unknown, action: string): never {
  console.error(`Sayable Supabase store ${action} failed`, error);
  throw new StoreError(500, `Could not ${action} Supabase store.`);
}

async function selectRows<T>(table: string): Promise<T[]> {
  const { data, error } = await getSupabaseStoreClient().from(table).select("*");
  if (error) {
    throwSupabaseError(error, `read ${table}`);
  }
  return (data || []) as T[];
}

async function readSupabaseStore(): Promise<StoreFile> {
  const [checks, responses, purchases, analyticsEvents, auditLogs, abuseEvents, resultSnapshots] = await Promise.all([
    selectRows<ComfortCheckRow>("comfort_checks"),
    selectRows<ResponseRow>("responses"),
    selectRows<PurchaseRow>("purchases"),
    selectRows<AnalyticsRow>("analytics_events"),
    selectRows<AuditRow>("audit_logs"),
    selectRows<AbuseRow>("abuse_events"),
    selectRows<SnapshotRow>("result_snapshots")
  ]);

  return {
    checks: checks.map(mapCheckRow),
    responses: responses.map(mapResponseRow),
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      checkId: purchase.check_id,
      productType: purchase.product_type,
      amountCents: purchase.amount_cents,
      mode: purchase.mode,
      status: purchase.status,
      createdAt: purchase.created_at
    })),
    analyticsEvents: analyticsEvents.map((event) => ({
      id: event.id,
      name: event.event_name,
      ...(event.check_id ? { checkId: event.check_id } : {}),
      createdAt: event.created_at,
      context: event.context
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      ...(log.check_id ? { checkId: log.check_id } : {}),
      createdAt: log.created_at,
      actor: log.actor_type,
      detail: log.detail
    })),
    abuseEvents: abuseEvents.map((event) => ({
      id: event.id,
      route: event.route,
      reason: event.reason,
      fingerprintHash: event.fingerprint_hash,
      createdAt: event.created_at
    })),
    resultSnapshots: resultSnapshots.map((snapshot) => ({
      id: snapshot.id,
      checkId: snapshot.check_id,
      resultTokenHash: snapshot.result_token_hash,
      snapshot: snapshot.snapshot,
      createdAt: snapshot.created_at,
      ...(snapshot.deleted_at ? { deletedAt: snapshot.deleted_at } : {})
    }))
  };
}

async function clearTable(table: string): Promise<void> {
  const { error } = await getSupabaseStoreClient().from(table).delete().not("id", "is", null);
  if (error) {
    throwSupabaseError(error, `clear ${table}`);
  }
}

async function insertRows(table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const { error } = await getSupabaseStoreClient().from(table).insert(rows);
  if (error) {
    throwSupabaseError(error, `write ${table}`);
  }
}

async function writeSupabaseStore(store: StoreFile): Promise<void> {
  for (const table of ["audit_logs", "analytics_events", "abuse_events", "result_snapshots", "purchases", "responses"]) {
    await clearTable(table);
  }
  await clearTable("comfort_checks");

  await insertRows(
    "comfort_checks",
    store.checks.map((check) => ({
      id: check.id,
      owner_user_id: check.ownerUserId || null,
      title: check.title,
      activity_type: check.activityType,
      plan: check.plan,
      status: check.status,
      draft: check.draft,
      theme_id: check.themeId,
      custom_theme: check.customTheme || null,
      guest_token_ciphertext: check.guestTokenCiphertext,
      guest_token_hash: check.guestTokenHash,
      host_token_hash: check.hostTokenHash,
      result_token_hash: check.resultTokenHash,
      created_by_fingerprint_hash: check.createdByFingerprintHash || null,
      expires_at: check.expiresAt,
      final_shared_at: check.finalSharedAt || null,
      created_at: check.createdAt,
      updated_at: check.updatedAt
    }))
  );
  await insertRows(
    "responses",
    store.responses.map((response) => ({
      id: response.id,
      check_id: response.checkId,
      response_token_hash: response.responseTokenHash,
      status: response.status,
      tier_id: response.tierId,
      constraint_ids: response.constraintIds,
      private_note: response.privateNote || null,
      client_nonce_hash: response.clientNonceHash || null,
      created_at: response.createdAt,
      updated_at: response.updatedAt || null,
      deleted_at: response.deletedAt || null
    }))
  );
  await insertRows(
    "purchases",
    store.purchases.map((purchase) => {
      const check = store.checks.find((candidate) => candidate.id === purchase.checkId);
      return {
        id: purchase.id,
        check_id: purchase.checkId,
        owner_user_id: check?.ownerUserId || null,
        product_type: purchase.productType,
        amount_cents: purchase.amountCents,
        mode: purchase.mode,
        status: purchase.status,
        created_at: purchase.createdAt
      };
    })
  );
  await insertRows(
    "result_snapshots",
    store.resultSnapshots.map((snapshot) => ({
      id: snapshot.id,
      check_id: snapshot.checkId,
      result_token_hash: snapshot.resultTokenHash,
      snapshot: snapshot.snapshot,
      created_at: snapshot.createdAt,
      deleted_at: snapshot.deletedAt || null
    }))
  );
  await insertRows(
    "analytics_events",
    store.analyticsEvents.map((event) => ({
      id: event.id,
      check_id: event.checkId || null,
      event_name: event.name,
      context: event.context,
      created_at: event.createdAt
    }))
  );
  await insertRows(
    "audit_logs",
    store.auditLogs.map((log) => ({
      id: log.id,
      check_id: log.checkId || null,
      actor_type: log.actor,
      action: log.action,
      detail: log.detail,
      created_at: log.createdAt
    }))
  );
  await insertRows(
    "abuse_events",
    store.abuseEvents.map((event) => ({
      id: event.id,
      route: event.route,
      reason: event.reason,
      fingerprint_hash: event.fingerprintHash,
      created_at: event.createdAt
    }))
  );
}

async function readStore(): Promise<StoreFile> {
  if (!isSupabaseStoreEnabled()) {
    return readFileStore();
  }
  return readSupabaseStore();
}

async function writeStore(store: StoreFile): Promise<void> {
  if (!isSupabaseStoreEnabled()) {
    writeFileStore(store);
    return;
  }
  await writeSupabaseStore(store);
}

function checkChangeSignatures(store: StoreFile): Map<string, string> {
  return new Map(
    store.checks.map((check) => {
      const responseState = store.responses
        .filter((response) => response.checkId === check.id)
        .map((response) => ({
          id: response.id,
          status: response.status,
          tierId: response.tierId,
          constraintIds: response.constraintIds,
          updatedAt: response.updatedAt || response.createdAt,
          deletedAt: response.deletedAt || null
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
      return [
        check.id,
        JSON.stringify({
          updatedAt: check.updatedAt,
          status: check.status,
          plan: check.plan,
          themeId: check.themeId,
          customTheme: check.customTheme || null,
          expiresAt: check.expiresAt,
          finalSharedAt: check.finalSharedAt || null,
          draft: check.draft,
          responses: responseState
        })
      ];
    })
  );
}

async function emitCheckChange(checkId: string): Promise<void> {
  const client = getSupabaseRealtimeClient();
  if (!client) {
    return;
  }
  const channel = client.channel(`sayable:check:${checkId}`, {
    config: {
      broadcast: { ack: true, self: false }
    }
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Supabase Realtime broadcast timed out.")), 1500);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const result = await channel.send({
          type: "broadcast",
          event: "check_changed",
          payload: { checkId, updatedAt: now() }
        });
        clearTimeout(timer);
        await client.removeChannel(channel);
        if (result === "ok") {
          resolve();
          return;
        }
        reject(new Error("Supabase Realtime broadcast failed."));
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        await client.removeChannel(channel);
        reject(new Error(`Supabase Realtime channel ${status.toLowerCase()}.`));
      }
    });
  });
}

function notifyChangedChecks(before: Map<string, string>, store: StoreFile): void {
  const after = checkChangeSignatures(store);
  for (const [checkId, signature] of after) {
    if (before.get(checkId) !== signature) {
      void emitCheckChange(checkId).catch((error) => console.error("Sayable realtime broadcast failed", error));
    }
  }
}

async function mutateStore<T>(mutator: (store: StoreFile) => T): Promise<T> {
  const run = storeMutationQueue.then(async () => {
    const lockOwner = await acquireSupabaseStoreLock();
    try {
      const store = await readStore();
      const before = checkChangeSignatures(store);
      const result = mutator(store);
      await writeStore(store);
      notifyChangedChecks(before, store);
      return result;
    } finally {
      await releaseSupabaseStoreLock(lockOwner);
    }
  });
  storeMutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function publicBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WEB_BASE_URL || "http://localhost:3000";
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(check: StoredCheck): boolean {
  return new Date(check.expiresAt).getTime() < Date.now();
}

function visibleStatus(check: StoredCheck): CheckStatus {
  return check.status === "active" && isExpired(check) ? "expired" : check.status;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function activeResponsesFor(store: StoreFile, checkId: string): StoredResponse[] {
  return store.responses.filter((response) => response.checkId === checkId && !response.deletedAt);
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

export interface StoreErrorTelemetry {
  kind?: "token_validation_failed" | "business_rule" | "validation";
  tokenClass?: "admin" | "guest" | "host" | "response" | "result";
  reason?: string;
}

type TokenClass = NonNullable<StoreErrorTelemetry["tokenClass"]>;

export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
    public telemetry: StoreErrorTelemetry = {}
  ) {
    super(message);
  }
}

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

export async function createCheck(input: CreateCheckInput, createdByFingerprintHash?: string, ownerUserId?: string): Promise<{
  check: StoredCheck;
  guestToken: string;
  hostToken: string;
}> {
  return mutateStore((store) => {
    const freeActiveLimit = getPlanLimits("free").maxActiveChecks;
    if (ownerUserId) {
      const activeForOwner = store.checks.filter(
        (check) =>
          check.ownerUserId === ownerUserId &&
          check.plan === "free" &&
          visibleStatus(check) === "active"
      ).length;
      if (activeForOwner >= freeActiveLimit) {
        throw new StoreError(429, "Free hosts can keep 3 active Comfort Checks at a time.");
      }
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
      ...(ownerUserId ? { ownerUserId } : {}),
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
      actor: "anonymous",
      detail: "Token-created check created without account."
    });
    return { check, guestToken, hostToken };
  });
}

function findCheckByToken(store: StoreFile, token: string, field: "guestTokenHash" | "hostTokenHash" | "resultTokenHash") {
  return store.checks.find((check) => check[field] === hashToken(token));
}

function tokenValidationFailure(
  tokenClass: TokenClass,
  token: string,
  status: number,
  message: string
): never {
  logAbuse(`token:${tokenClass}`, "invalid_token", hashToken(token));
  throw new StoreError(status, message, {
    kind: "token_validation_failed",
    tokenClass,
    reason: "invalid_token"
  });
}

function requireCheckByToken(
  store: StoreFile,
  token: string,
  field: "guestTokenHash" | "hostTokenHash" | "resultTokenHash",
  tokenClass: TokenClass,
  message: string
) {
  const check = findCheckByToken(store, token, field);
  if (!check) {
    tokenValidationFailure(tokenClass, token, 404, message);
  }
  return check;
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

export async function getSnapshot(resultToken: string) {
  const store = await readStore();
  const tokenHash = hashToken(resultToken);
  const snapshot = store.resultSnapshots.find(
    (candidate) => candidate.resultTokenHash === tokenHash && !candidate.deletedAt
  );
  if (!snapshot) {
    tokenValidationFailure("result", resultToken, 404, "Result snapshot not found.");
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

export function submitResponse(
  guestToken: string,
  input: ResponseInput,
  clientNonceHash?: string
): Promise<{ response: StoredResponse; check: StoredCheck }> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, guestToken, "guestTokenHash", "guest", "Comfort Check not found.");
    requireUsableCheck(check);

    const activeCount = activeResponsesFor(store, check.id).length;
    const limit = getPlanLimits(check.plan).maxResponsesPerCheck;
    if (activeCount >= limit) {
      throw new StoreError(429, `This ${check.plan} Comfort Check has reached its ${limit}-response limit.`);
    }
    validateResponseInput(check.draft, input);
    if (clientNonceHash) {
      const duplicate = store.responses.find(
        (response) =>
          response.checkId === check.id &&
          response.clientNonceHash === clientNonceHash &&
          !response.deletedAt
      );
      if (duplicate) {
        throw new StoreError(409, "You already responded from this browser. Use your response link to edit.");
      }
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
      ...(clientNonceHash ? { clientNonceHash } : {}),
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
    return { response: { ...response, responseTokenHash: token }, check };
  });
}

export async function getResponse(responseToken: string): Promise<StoredResponse> {
  const store = await readStore();
  const response = store.responses.find((candidate) => candidate.responseTokenHash === hashToken(responseToken));
  if (!response || response.deletedAt) {
    tokenValidationFailure("response", responseToken, 404, "Response token not found.");
  }
  return response;
}

export function updateResponse(responseToken: string, input: ResponseInput): Promise<StoredResponse> {
  return mutateStore((store) => {
    const response = store.responses.find((candidate) => candidate.responseTokenHash === hashToken(responseToken));
    if (!response || response.deletedAt) {
      tokenValidationFailure("response", responseToken, 404, "Response token not found.");
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
      tokenValidationFailure("response", responseToken, 404, "Response token not found or already deleted.");
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

export function updateHostCheck(
  hostToken: string,
  patch: {
    constraints?: ComfortConstraint[] | undefined;
    questions?: ComfortQuestion[] | undefined;
    tiers?: ComfortTier[] | undefined;
    resetDraft?: boolean | undefined;
    themeId?: string | undefined;
    customTheme?: { accent: string; icon: string } | undefined;
    resetCustomTheme?: boolean | undefined;
    status?: "closed" | "deleted" | undefined;
  }
): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
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
      const normalized = patch.constraints.map((constraint) => {
        const previous = existing.get(constraint.id);
        const label = constraint.label.trim().slice(0, 100);
        if (!label) {
          throw new StoreError(400, "Constraint labels cannot be empty.");
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
  });
}

export function claimCheck(hostToken: string, ownerUserId: string): Promise<StoredCheck> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
    if (check.ownerUserId && check.ownerUserId !== ownerUserId) {
      throw new StoreError(403, "This Comfort Check is already saved to another account.");
    }
    check.ownerUserId = ownerUserId;
    check.updatedAt = now();
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "google_sign_in_completed",
      checkId: check.id,
      createdAt: check.updatedAt,
      context: { mode: "demo_feature_flag" }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "check_claimed",
      checkId: check.id,
      createdAt: check.updatedAt,
      actor: "demo_user",
      detail: "Token-created check claimed into signed demo auth session."
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

export function deleteOwnerAccount(ownerUserId: string): Promise<{ deletedChecks: number }> {
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
        actor: "demo_user",
        detail: "Signed host account deletion deleted an owned Comfort Check."
      });
      deletedChecks += 1;
    }
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "account_deleted",
      createdAt: deletedAt,
      actor: "demo_user",
      detail: "Signed host requested account deletion; owned Comfort Checks were deleted."
    });
    return { deletedChecks };
  });
}

export function upgradeCheck(
  hostToken: string,
  outcome: "success" | "failed" | "cancelled" = "success",
  ownerUserId?: string
): Promise<PurchaseRecord> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
    if (!check.ownerUserId) {
      throw new StoreError(401, "Save this Comfort Check with Google before upgrading.");
    }
    if (!ownerUserId || ownerUserId !== check.ownerUserId) {
      throw new StoreError(403, "This Premium Check upgrade belongs to a different host account.");
    }
    requireUsableCheck(check);
    if (outcome !== "success") {
      const failed: PurchaseRecord = {
        id: crypto.randomUUID(),
        checkId: check.id,
        productType: "premium_check_upgrade",
        amountCents: 499,
        mode: process.env.STRIPE_MODE === "test" ? "test" : "mock",
        status: outcome === "failed" ? "failed" : "cancelled",
        createdAt: now()
      };
      store.purchases.push(failed);
      store.analyticsEvents.push({
        id: crypto.randomUUID(),
        name: `premium_mock_checkout_${failed.status}`,
        checkId: check.id,
        createdAt: failed.createdAt,
        context: {}
      });
      store.auditLogs.push({
        id: crypto.randomUUID(),
        action: `premium_mock_checkout_${failed.status}`,
        checkId: check.id,
        createdAt: failed.createdAt,
        actor: "demo_user",
        detail: `Premium mock checkout ${failed.status}.`
      });
      return failed;
    }
    if (check.plan === "premium") {
      throw new StoreError(409, "This Comfort Check is already Premium.");
    }
    const purchase: PurchaseRecord = {
      id: crypto.randomUUID(),
      checkId: check.id,
      productType: "premium_check_upgrade",
      amountCents: 499,
      mode: process.env.STRIPE_MODE === "test" ? "test" : "mock",
      status: "completed",
      createdAt: now()
    };
    check.plan = "premium";
    if (check.themeId === "sayable_default") {
      check.themeId = defaultThemeForActivity(check.activityType);
    }
    check.expiresAt = addDays(new Date(), getPlanLimits("premium").retentionDays);
    check.updatedAt = purchase.createdAt;
    store.purchases.push(purchase);
    store.analyticsEvents.push({
      id: crypto.randomUUID(),
      name: "premium_mock_checkout_completed",
      checkId: check.id,
      createdAt: purchase.createdAt,
      context: { product_type: "premium_check_upgrade" }
    });
    store.auditLogs.push({
      id: crypto.randomUUID(),
      action: "premium_mock_checkout_completed",
      checkId: check.id,
      createdAt: purchase.createdAt,
      actor: "demo_user",
      detail: "Premium Check mock upgrade completed for signed owner."
    });
    return purchase;
  });
}

export function markFinalShared(hostToken: string): Promise<{ check: StoredCheck; resultToken: string }> {
  return mutateStore((store) => {
    const check = requireCheckByToken(store, hostToken, "hostTokenHash", "host", "Host link not found.");
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
    return { check, resultToken };
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
  await writeStore(blankStore());
}
