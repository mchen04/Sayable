import { clampCustomConstraints } from "./limits";
import type {
  ActivityType,
  ComfortConstraint,
  ComfortDraft,
  ComfortQuestion,
  ComfortTier,
  DraftInput,
  ParsedPrice,
  PlanTier,
  Vibe
} from "./types";
import { VIBES } from "./types";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  dinner_drinks: "Dinner/drinks",
  birthday: "Birthday",
  casual_hangout: "Casual hangout",
  tickets_event: "Tickets/event",
  group_trip: "Group trip",
  home_chill: "Home/chill",
  custom: "Custom"
};

const VIBE_LABELS: Record<Vibe, string> = {
  low_key: "low-key",
  celebratory: "celebratory",
  adventurous: "adventurous",
  cozy: "cozy",
  polished: "polished",
  spontaneous: "spontaneous"
};

const ACTIVITY_CONSTRAINTS: Record<ActivityType, ComfortConstraint[]> = {
  dinner_drinks: [
    { id: "budget-friendly", label: "Keep the bill comfortable", group: "budget" },
    { id: "food-options", label: "Has food options for everyone", group: "food" },
    { id: "easy-transit", label: "Easy to get to or park near", group: "access" },
    { id: "talk-volume", label: "Quiet enough to actually talk", group: "vibe" }
  ],
  birthday: [
    { id: "guest-budget", label: "Does not pressure anyone's budget", group: "budget" },
    { id: "group-size", label: "Works for the whole group size", group: "logistics" },
    { id: "timing", label: "Timing works without rushing", group: "timing" },
    { id: "celebration-level", label: "Feels festive but not too much", group: "vibe" }
  ],
  casual_hangout: [
    { id: "low-pressure", label: "Easy to opt in without pressure", group: "vibe" },
    { id: "short-notice", label: "Works on short notice", group: "timing" },
    { id: "close-by", label: "Close enough for most people", group: "access" },
    { id: "cheap-or-free", label: "Cheap or free is preferred", group: "budget" }
  ],
  tickets_event: [
    { id: "ticket-price", label: "Ticket price feels okay", group: "budget" },
    { id: "commitment", label: "Commitment level feels okay", group: "timing" },
    { id: "seat-location", label: "Seats/location are worth it", group: "logistics" },
    { id: "backup-plan", label: "Need a backup if people are unsure", group: "logistics" }
  ],
  group_trip: [
    { id: "total-cost", label: "Total cost is realistic", group: "budget" },
    { id: "dates", label: "Dates work before booking", group: "timing" },
    { id: "travel-load", label: "Travel time and effort feel okay", group: "access" },
    { id: "planning-detail", label: "Need clearer plan details first", group: "logistics" }
  ],
  home_chill: [
    { id: "host-effort", label: "Host effort stays reasonable", group: "logistics" },
    { id: "food-drink", label: "Food/drinks are clear", group: "food" },
    { id: "quiet-night", label: "Keeps the night relaxed", group: "vibe" },
    { id: "arrival-window", label: "Arrival time is flexible", group: "timing" }
  ],
  custom: [
    { id: "budget-check", label: "Budget feels comfortable", group: "budget" },
    { id: "timing-check", label: "Timing works for most people", group: "timing" },
    { id: "location-check", label: "Location is manageable", group: "access" },
    { id: "vibe-check", label: "Vibe feels right", group: "vibe" }
  ]
};

const BASE_TIERS: ComfortTier[] = [
  {
    id: "easy_yes",
    label: "Easy yes",
    description: "This feels comfortable as-is.",
    score: 3
  },
  {
    id: "works_with_tweaks",
    label: "Works with tweaks",
    description: "I could be in if one or two things shift.",
    score: 2
  },
  {
    id: "not_comfortable",
    label: "Not comfortable",
    description: "This does not work for me right now.",
    score: 0
  }
];

const DEFAULT_QUESTIONS: ComfortQuestion[] = [
  {
    id: "attendance",
    prompt: "Where are you on this plan?",
    helper: "Your answer helps the host choose a plan that feels good for the group."
  },
  {
    id: "comfort",
    prompt: "What comfort level fits best?",
    helper: "Pick the tier that matches how the plan feels, not what you think others want."
  },
  {
    id: "constraints",
    prompt: "Anything that would make this easier?",
    helper: "Select all that apply. The host sees grouped patterns, not a named answer sheet."
  }
];

export function activityLabel(activityType: ActivityType): string {
  return ACTIVITY_LABELS[activityType];
}

export function normalizeTitle(title: string): string {
  const normalized = title
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^[\p{P}\p{S}\s]+$/u.test(normalized)) {
    return "Untitled Comfort Check";
  }
  return normalized.slice(0, 90);
}

export function parsePrice(raw?: string): ParsedPrice {
  const value = raw?.trim();
  if (!value) {
    return { state: "none" };
  }

  const lowered = value.toLowerCase();
  if (/\b(free|no cost|zero)\b/.test(lowered)) {
    return { state: "free", amount: 0, raw: value };
  }

  const matches = Array.from(lowered.matchAll(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k)?/g));
  if (matches.length === 0) {
    return /[a-z]/i.test(value) ? { state: "ambiguous", raw: value } : { state: "malformed", raw: value };
  }

  const numeric = (matches[0]?.[1] ?? "0").replace(/,/g, "");
  const multiplier = matches[0]?.[2] === "k" ? 1000 : 1;
  const amount = Number(numeric) * multiplier;
  if (!Number.isFinite(amount)) {
    return { state: "malformed", raw: value };
  }

  const perPerson = /\b(pp|per person|each|split)\b/.test(lowered);
  if (amount === 0) {
    return { state: "free", amount, raw: value, perPerson };
  }
  if (amount <= 20) {
    return { state: "low", amount, raw: value, perPerson };
  }
  if (amount <= 75) {
    return { state: "normal", amount, raw: value, perPerson };
  }
  if (amount <= 250) {
    return { state: "high", amount, raw: value, perPerson };
  }
  return { state: "extreme", amount, raw: value, perPerson };
}

function priceConstraint(price: ParsedPrice): ComfortConstraint | undefined {
  if (price.state === "none") {
    return { id: "price-flexible", label: "Keep cost flexible", group: "budget" };
  }
  if (price.state === "free") {
    return { id: "free-still-comfortable", label: "Free plan still feels worth the time", group: "timing" };
  }
  if (price.state === "high" || price.state === "extreme") {
    const suffix = price.amount ? ` around $${price.amount}${price.perPerson ? "/person" : ""}` : "";
    return { id: "price-high", label: `Price${suffix} needs a real yes`, group: "budget" };
  }
  if (price.state === "ambiguous" || price.state === "malformed") {
    return { id: "price-clarity", label: "Need clearer price details", group: "budget" };
  }
  return undefined;
}

function vibeConstraint(vibe?: Vibe): ComfortConstraint | undefined {
  if (!vibe || !VIBES.includes(vibe)) {
    return undefined;
  }
  return {
    id: `vibe-${vibe}`,
    label: `Keep it ${VIBE_LABELS[vibe]}`,
    group: "vibe"
  };
}

function uniqueConstraints(constraints: ComfortConstraint[]): ComfortConstraint[] {
  const seen = new Set<string>();
  return constraints.filter((constraint) => {
    const key = constraint.label.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function customConstraintRows(plan: PlanTier, customConstraints: string[] = []): ComfortConstraint[] {
  return clampCustomConstraints(
    plan,
    customConstraints.map((constraint) => constraint.trim()).filter(Boolean)
  ).map((constraint, index) => ({
    id: `custom-${index + 1}-${constraint.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "constraint"}`,
    label: constraint.slice(0, 80),
    group: "custom",
    isCustom: true
  }));
}

export function createComfortDraft(input: DraftInput, plan: PlanTier = "free"): ComfortDraft {
  const title = normalizeTitle(input.title);
  const price = parsePrice(input.currentIdea);
  const activity = activityLabel(input.activityType);
  const idea = input.currentIdea?.trim();
  const safeVibe = input.vibe && VIBES.includes(input.vibe) ? input.vibe : undefined;
  const vibeText = safeVibe ? ` with a ${VIBE_LABELS[safeVibe]} vibe` : "";
  const extraConstraints = [priceConstraint(price), vibeConstraint(input.vibe)].filter(
    (constraint): constraint is ComfortConstraint => Boolean(constraint)
  );
  const constraints = uniqueConstraints([
    ...extraConstraints,
    ...ACTIVITY_CONSTRAINTS[input.activityType],
    ...customConstraintRows(plan, input.customConstraints)
  ]).slice(0, plan === "premium" ? 16 : 8);

  const shareText = `Comfort Check for ${title}: quick private vibe check before we lock it in. ${activity}${vibeText}${
    idea ? `, current idea: ${idea}` : ""
  }.`;

  return {
    title,
    activityType: input.activityType,
    activityLabel: activity,
    ...(safeVibe ? { vibe: safeVibe } : {}),
    currentIdea: idea,
    price,
    questions: DEFAULT_QUESTIONS,
    tiers: BASE_TIERS,
    constraints,
    privacyCopy:
      "Your response is private. The host sees grouped comfort patterns and constraints, not named budget answers or private notes.",
    shareText,
    resultIntro: `Sayable will summarize whether ${title} feels easy, workable with tweaks, or worth rethinking.`,
    finalSharePrompt: `Send the group the clearest next step for ${title}, without calling anyone out.`
  };
}
