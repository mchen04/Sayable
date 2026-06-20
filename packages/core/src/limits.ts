import type { PlanLimits, PlanTier } from "./types";

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxActiveChecks: 3,
    maxResponsesPerCheck: 30,
    maxCustomConstraints: 2,
    retentionDays: 30,
    themes: "default"
  },
  premium: {
    maxActiveChecks: 3,
    maxResponsesPerCheck: 100,
    maxCustomConstraints: 10,
    retentionDays: 180,
    themes: "premium"
  }
};

export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function clampCustomConstraints(plan: PlanTier, constraints: string[]): string[] {
  const max = getPlanLimits(plan).maxCustomConstraints;
  return constraints.slice(0, max);
}
