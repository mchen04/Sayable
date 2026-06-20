import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  type AbuseEvent,
  type AnalyticsEvent,
  type AuditLog,
  type PurchaseRecord,
  type StoreFile,
  type StoredCheck,
  type StoredResponse,
  type StoredResultSnapshot,
  StoreError
} from "./store-types";

function resolveStorePath(): string {
  const configuredPath = process.env.SAYABLE_STORE_PATH;
  if (configuredPath) {
    return configuredPath;
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".sayable-data", "store.json");
}

const STORE_PATH = resolveStorePath();
type RealtimeTransport = NonNullable<NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"]>;
const WebSocketTransport = WebSocket as unknown as RealtimeTransport;
let supabaseStoreClient: SupabaseClient | undefined;
let supabaseRealtimeClient: SupabaseClient | undefined;
let storeMutationQueue: Promise<void> = Promise.resolve();
const SUPABASE_STORE_LOCK_KEY = "sayable_runtime_store";

declare global {
  var __sayableTokenEncryptionSecret: string | undefined;
}

export function now(): string {
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

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(ciphertext: string): string {
  const [version, iv, tag, encrypted] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new StoreError(500, "Guest share link material is unavailable.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function blankStore(): StoreFile {
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

export function isSupabaseStoreEnabled(): boolean {
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
    },
    realtime: {
      transport: WebSocketTransport
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
    },
    realtime: {
      transport: WebSocketTransport
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
  activity_type: StoredCheck["activityType"];
  plan: StoredCheck["plan"];
  status: StoredCheck["status"];
  draft: StoredCheck["draft"];
  theme_id: string;
  custom_theme: StoredCheck["customTheme"] | null;
  guest_token_ciphertext: string;
  guest_token_hash: string;
  host_token_hash: string;
  result_token_hash: string;
  created_by_fingerprint_hash: string | null;
  creator_nonce_hash: string | null;
  expires_at: string;
  final_shared_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResponseRow {
  id: string;
  check_id: string;
  response_token_hash: string;
  status: StoredResponse["status"];
  tier_id: string;
  constraint_ids: string[];
  private_note: string | null;
  client_nonce_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PurchaseRow {
  id: string;
  check_id: string;
  product_type: "premium_check_upgrade";
  amount_cents: 499;
  mode: "mock" | "test";
  status: PurchaseRecord["status"];
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
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
    ...(row.creator_nonce_hash ? { creatorNonceHash: row.creator_nonce_hash } : {}),
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
    updatedAt: row.updated_at,
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
      createdAt: purchase.created_at,
      ...(purchase.stripe_checkout_session_id ? { stripeCheckoutSessionId: purchase.stripe_checkout_session_id } : {}),
      ...(purchase.stripe_payment_intent_id ? { stripePaymentIntentId: purchase.stripe_payment_intent_id } : {})
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

function toSupabasePayload(store: StoreFile) {
  return {
    checks: store.checks.map((check) => ({
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
      creator_nonce_hash: check.creatorNonceHash || null,
      expires_at: check.expiresAt,
      final_shared_at: check.finalSharedAt || null,
      created_at: check.createdAt,
      updated_at: check.updatedAt
    })),
    responses: store.responses.map((response) => ({
      id: response.id,
      check_id: response.checkId,
      response_token_hash: response.responseTokenHash,
      status: response.status,
      tier_id: response.tierId,
      constraint_ids: response.constraintIds,
      private_note: response.privateNote || null,
      client_nonce_hash: response.clientNonceHash || null,
      created_at: response.createdAt,
      updated_at: response.updatedAt || response.createdAt,
      deleted_at: response.deletedAt || null
    })),
    purchases: store.purchases.map((purchase) => {
      const check = store.checks.find((candidate) => candidate.id === purchase.checkId);
      return {
        id: purchase.id,
        check_id: purchase.checkId,
        owner_user_id: check?.ownerUserId || null,
        product_type: purchase.productType,
        amount_cents: purchase.amountCents,
        mode: purchase.mode,
        status: purchase.status,
        stripe_checkout_session_id: purchase.stripeCheckoutSessionId || null,
        stripe_payment_intent_id: purchase.stripePaymentIntentId || null,
        created_at: purchase.createdAt
      };
    }),
    resultSnapshots: store.resultSnapshots.map((snapshot) => ({
      id: snapshot.id,
      check_id: snapshot.checkId,
      result_token_hash: snapshot.resultTokenHash,
      snapshot: snapshot.snapshot,
      created_at: snapshot.createdAt,
      deleted_at: snapshot.deletedAt || null
    })),
    analyticsEvents: store.analyticsEvents.map((event) => ({
      id: event.id,
      check_id: event.checkId || null,
      event_name: event.name,
      context: event.context,
      created_at: event.createdAt
    })),
    auditLogs: store.auditLogs.map((log) => ({
      id: log.id,
      check_id: log.checkId || null,
      actor_type: log.actor,
      action: log.action,
      detail: log.detail,
      created_at: log.createdAt
    })),
    abuseEvents: store.abuseEvents.map((event) => ({
      id: event.id,
      route: event.route,
      reason: event.reason,
      fingerprint_hash: event.fingerprintHash,
      created_at: event.createdAt
    }))
  };
}

async function writeSupabaseStore(store: StoreFile, lockOwner: string): Promise<void> {
  const payload = toSupabasePayload(store);
  const { error } = await getSupabaseStoreClient().rpc("replace_sayable_runtime_store", {
    p_lock_key: SUPABASE_STORE_LOCK_KEY,
    p_owner_id: lockOwner,
    p_checks: payload.checks,
    p_responses: payload.responses,
    p_purchases: payload.purchases,
    p_result_snapshots: payload.resultSnapshots,
    p_analytics_events: payload.analyticsEvents,
    p_audit_logs: payload.auditLogs,
    p_abuse_events: payload.abuseEvents
  });
  if (error) {
    throwSupabaseError(error, "replace runtime store transactionally");
  }
}

export async function readStore(): Promise<StoreFile> {
  if (!isSupabaseStoreEnabled()) {
    return readFileStore();
  }
  return readSupabaseStore();
}

async function writeStore(store: StoreFile, lockOwner: string | undefined): Promise<void> {
  if (!isSupabaseStoreEnabled()) {
    writeFileStore(store);
    return;
  }
  if (!lockOwner) {
    throw new StoreError(500, "Refusing to write the Supabase runtime store without holding the runtime lock.");
  }
  await writeSupabaseStore(store, lockOwner);
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
    let settled = false;
    let cleanupStarted = false;
    const cleanup = () => {
      if (cleanupStarted) {
        return;
      }
      cleanupStarted = true;
      void client.removeChannel(channel).catch((error) => {
        console.error("Sayable realtime channel cleanup failed", error);
      });
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Supabase Realtime broadcast timed out.")), 1500);
    channel.subscribe(async (status) => {
      if (settled) {
        return;
      }
      if (status === "SUBSCRIBED") {
        const result = await channel.send({
          type: "broadcast",
          event: "check_changed",
          payload: { checkId, updatedAt: now() }
        });
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        cleanup();
        if (result === "ok") {
          resolve();
          return;
        }
        reject(new Error("Supabase Realtime broadcast failed."));
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        fail(new Error(`Supabase Realtime channel ${status.toLowerCase()}.`));
      }
    });
  });
}

function notifyChangedChecks(before: Map<string, string>, store: StoreFile): void {
  // Realtime broadcast is only meaningful for the Supabase backend (multi-client
  // live updates). The file backend is a single-instance local-only path, so skip
  // it to avoid pointless broadcast attempts and latency.
  if (!isSupabaseStoreEnabled()) {
    return;
  }
  const after = checkChangeSignatures(store);
  for (const [checkId, signature] of after) {
    if (before.get(checkId) !== signature) {
      void emitCheckChange(checkId).catch((error) => console.error("Sayable realtime broadcast failed", error));
    }
  }
}

// Append-only observability tables (analytics/audit/abuse) would otherwise grow
// without bound. Because every mutation rewrites the whole store, unbounded
// growth makes each write progressively more expensive and is an amplification
// vector. Cap each to its most recent entries so the store stays bounded.
const ANALYTICS_EVENT_CAP = 5000;
const AUDIT_LOG_CAP = 5000;
const ABUSE_EVENT_CAP = 2000;

function pruneAppendOnlyTables(store: StoreFile): void {
  if (store.analyticsEvents.length > ANALYTICS_EVENT_CAP) {
    store.analyticsEvents = store.analyticsEvents.slice(-ANALYTICS_EVENT_CAP);
  }
  if (store.auditLogs.length > AUDIT_LOG_CAP) {
    store.auditLogs = store.auditLogs.slice(-AUDIT_LOG_CAP);
  }
  if (store.abuseEvents.length > ABUSE_EVENT_CAP) {
    store.abuseEvents = store.abuseEvents.slice(-ABUSE_EVENT_CAP);
  }
}

export async function mutateStore<T>(mutator: (store: StoreFile) => T): Promise<T> {
  const run = storeMutationQueue.then(async () => {
    const lockOwner = await acquireSupabaseStoreLock();
    try {
      const store = await readStore();
      const before = checkChangeSignatures(store);
      const result = mutator(store);
      pruneAppendOnlyTables(store);
      await writeStore(store, lockOwner);
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

export async function resetStoreForTests(): Promise<void> {
  if (!isSupabaseStoreEnabled()) {
    writeFileStore(blankStore());
    return;
  }
  const lockOwner = await acquireSupabaseStoreLock();
  try {
    await writeStore(blankStore(), lockOwner);
  } finally {
    await releaseSupabaseStoreLock(lockOwner);
  }
}
