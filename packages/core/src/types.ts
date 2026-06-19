export const ACTIVITY_TYPES = [
  "dinner_drinks",
  "birthday",
  "casual_hangout",
  "tickets_event",
  "group_trip",
  "home_chill",
  "custom"
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const VIBES = [
  "low_key",
  "celebratory",
  "adventurous",
  "cozy",
  "polished",
  "spontaneous"
] as const;

export type Vibe = (typeof VIBES)[number];

export type PlanTier = "free" | "premium";

export type ResponseStatus = "in" | "maybe" | "out";

export interface DraftInput {
  title: string;
  activityType: ActivityType;
  currentIdea?: string | undefined;
  vibe?: Vibe | undefined;
  customConstraints?: string[] | undefined;
}

export interface ComfortQuestion {
  id: string;
  prompt: string;
  helper: string;
}

export interface ComfortTier {
  id: string;
  label: string;
  description: string;
  score: number;
}

export interface ComfortConstraint {
  id: string;
  label: string;
  group: "budget" | "timing" | "access" | "vibe" | "food" | "logistics" | "custom";
  isCustom?: boolean | undefined;
}

export interface ComfortDraft {
  title: string;
  activityType: ActivityType;
  activityLabel: string;
  vibe?: Vibe | undefined;
  currentIdea?: string | undefined;
  price: ParsedPrice;
  questions: ComfortQuestion[];
  tiers: ComfortTier[];
  constraints: ComfortConstraint[];
  privacyCopy: string;
  shareText: string;
  resultIntro: string;
  finalSharePrompt: string;
}

export interface ParsedPrice {
  state: "none" | "free" | "low" | "normal" | "high" | "extreme" | "ambiguous" | "malformed";
  amount?: number | undefined;
  raw?: string | undefined;
  perPerson?: boolean | undefined;
}

export interface GuestResponse {
  status: ResponseStatus;
  tierId: string;
  constraintIds: string[];
  privateNote?: string | undefined;
  createdAt: string;
  updatedAt?: string | undefined;
  deletedAt?: string | undefined;
}

export interface ResultSummary {
  responseCount: number;
  privacyThreshold: number;
  isPrivacySuppressed: boolean;
  bestFit: {
    label: string;
    detail: string;
    tone: "green" | "yellow" | "red" | "neutral";
  };
  comfortRange: {
    label: string;
    detail: string;
  };
  currentIdeaWarning?: string | undefined;
  groupedConstraints: Array<{
    id: string;
    label: string;
    group: ComfortConstraint["group"];
    signal: "common" | "strong" | "broad";
    detail: string;
  }>;
  finalMessage: string;
  publicSnapshot: {
    headline: string;
    detail: string;
    safeStats: string[];
  };
}

export interface PlanLimits {
  maxActiveChecks: number;
  maxResponsesPerCheck: number;
  maxCustomConstraints: number;
  retentionDays: number;
  themes: "default" | "premium";
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  premium: boolean;
  activityHint?: ActivityType | undefined;
  accent: string;
  ink: string;
  paper: string;
  soft: string;
  icon: string;
}
