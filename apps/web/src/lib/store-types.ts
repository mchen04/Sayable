import {
  type ActivityType,
  type ComfortDraft,
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
  status: "started" | "completed" | "failed" | "cancelled";
  createdAt: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
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
  actor: "anonymous" | "host" | "guest" | "demo_user" | "admin" | "system";
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

export interface StoreFile {
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

export interface StoreErrorTelemetry {
  kind?: "token_validation_failed" | "business_rule" | "validation";
  tokenClass?: "admin" | "guest" | "host" | "response" | "result";
  reason?: string;
}

export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
    public telemetry: StoreErrorTelemetry = {}
  ) {
    super(message);
  }
}
