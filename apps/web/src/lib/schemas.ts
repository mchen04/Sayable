import { ACTIVITY_TYPES, VIBES } from "@sayable/core";
import { z } from "zod";

export const createCheckSchema = z.object({
  title: z.string().max(120),
  activityType: z.enum(ACTIVITY_TYPES),
  currentIdea: z.string().max(160).optional(),
  vibe: z.enum(VIBES).optional(),
  customConstraints: z.array(z.string().max(80)).max(10).optional(),
  creatorNonce: z.string().min(16).max(120).optional()
});

const responseBaseSchema = z.object({
  status: z.enum(["in", "maybe", "out"]),
  tierId: z.string().min(1).max(80),
  constraintIds: z.array(z.string().min(1).max(120)).max(12),
  privateNote: z.string().max(500).optional()
});

export const responseCreateSchema = responseBaseSchema.extend({
  clientNonce: z.string().min(16).max(120)
});

export const responseUpdateSchema = responseBaseSchema.extend({
  clientNonce: z.string().min(16).max(120).optional()
});

export const updateCheckSchema = z.object({
  resetDraft: z.boolean().optional(),
  constraints: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(100),
        group: z.enum(["budget", "timing", "access", "vibe", "food", "logistics", "custom"]),
        isCustom: z.boolean().optional()
      })
    )
    .max(16)
    .optional(),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        prompt: z.string().min(1).max(140),
        helper: z.string().min(1).max(220)
      })
    )
    .min(1)
    .max(6)
    .optional(),
  tiers: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(180),
        score: z.number().min(0).max(3)
      })
    )
    .min(2)
    .max(5)
    .optional(),
  themeId: z.string().min(1).max(80).optional(),
  customTheme: z
    .object({
      accent: z.string().min(3).max(24),
      icon: z.string().min(1).max(16)
    })
    .optional(),
  resetCustomTheme: z.boolean().optional(),
  status: z.enum(["closed", "deleted"]).optional()
});

export const upgradeSchema = z.object({
  outcome: z.enum(["success", "failed", "cancelled"]).optional()
});

export const adminActionSchema = z
  .object({
    hostToken: z.string().min(1).max(240).optional(),
    checkId: z.string().uuid().optional(),
    action: z.enum(["close", "delete"])
  })
  .refine((input) => Boolean(input.hostToken) !== Boolean(input.checkId), {
    message: "Provide exactly one of hostToken or checkId."
  });

const analyticsEventNames = [
  "app_opened",
  "web_opened",
  "create_flow_started",
  "auto_draft_generated",
  "check_created",
  "share_sheet_opened",
  "host_review_opened",
  "link_copied",
  "guest_page_opened",
  "guest_response_submitted",
  "guest_response_edited",
  "guest_response_deleted",
  "host_results_viewed",
  "final_share_generated",
  "google_sign_in_started",
  "google_sign_in_completed",
  "google_sign_in_failed",
  "premium_mock_checkout_started",
  "premium_mock_checkout_completed",
  "premium_mock_checkout_failed",
  "premium_mock_checkout_cancelled",
  "limit_hit",
  "error_shown",
  "check_updated",
  "auto_draft_reset"
] as const;

const analyticsContextSchema = z.record(z.union([z.string().max(160), z.number().finite(), z.boolean(), z.null()]));

const allowedStatusStrings = new Set([
  "active",
  "closed",
  "deleted",
  "expired",
  "in",
  "maybe",
  "out",
  "free",
  "premium"
]);

const allowedContextStrings: Record<string, Set<string>> = {
  activityType: new Set(ACTIVITY_TYPES),
  error_kind: new Set(["store", "unexpected", "token_validation_failed", "business_rule", "validation"]),
  method: new Set(["GET", "POST", "PATCH", "DELETE"]),
  mode: new Set(["demo_feature_flag", "mock", "test", "supabase_oauth"]),
  outcome: new Set(["success", "failed", "cancelled"]),
  plan: new Set(["free", "premium"]),
  product_type: new Set(["premium_check_upgrade"]),
  reason: new Set(["invalid_token", "rate_limit", "unauthorized", "forbidden", "not_found", "invalid_json"]),
  status: allowedStatusStrings,
  surface: new Set([
    "web",
    "host_review",
    "host_results",
    "native_host_home",
    "native_create",
    "native_results",
    "native_results_load",
    "native_final_share"
  ]),
  token_class: new Set(["guest", "host", "response", "result"])
};

function sanitizeRouteLabel(value: string): string | undefined {
  if (!value.startsWith("/") || value.length > 120) {
    return undefined;
  }
  const redacted = value
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{12,}$/.test(segment) ? "[token]" : segment))
    .join("/");
  if (!/^\/[A-Za-z0-9_\-./[\]]*$/.test(redacted)) {
    return undefined;
  }
  return redacted;
}

function sanitizeAnalyticsContext(
  context: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key === "route" && typeof value === "string") {
      const route = sanitizeRouteLabel(value);
      if (route) {
        sanitized.route = route;
      }
      continue;
    }
    if (key === "request_hash" && typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) {
      sanitized.request_hash = value;
      continue;
    }
    if (key === "status" && typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) {
      sanitized.status = value;
      continue;
    }
    if (typeof value === "string" && allowedContextStrings[key]?.has(value)) {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "boolean" && key === "retryable") {
      sanitized.retryable = value;
    }
  }
  return sanitized;
}

export const analyticsSchema = z.object({
  name: z.enum(analyticsEventNames),
  context: analyticsContextSchema.optional().transform((context) => sanitizeAnalyticsContext(context || {}))
});
