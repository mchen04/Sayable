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
import { ACTIVITY_TYPES, VIBES } from "./types";

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

// Constraint labels are written as short, neutral topic phrases so they read
// naturally both as "what would make this easier?" options AND when the result
// engine references them ("A comfortable bill mattered to most people.").
const ACTIVITY_CONSTRAINTS: Record<ActivityType, ComfortConstraint[]> = {
  dinner_drinks: [
    { id: "budget-friendly", label: "A comfortable bill", group: "budget" },
    { id: "food-options", label: "Food options for everyone", group: "food" },
    { id: "easy-transit", label: "An easy place to get to", group: "access" },
    { id: "talk-volume", label: "A spot quiet enough to talk", group: "vibe" }
  ],
  birthday: [
    { id: "guest-budget", label: "A budget that works for everyone", group: "budget" },
    { id: "group-size", label: "Room for the whole group", group: "logistics" },
    { id: "timing", label: "Timing that isn't rushed", group: "timing" },
    { id: "celebration-level", label: "The right amount of festive", group: "vibe" }
  ],
  casual_hangout: [
    { id: "low-pressure", label: "An easy opt-in", group: "vibe" },
    { id: "short-notice", label: "Short-notice flexibility", group: "timing" },
    { id: "close-by", label: "Close by for most people", group: "access" },
    { id: "cheap-or-free", label: "Cheap or free", group: "budget" }
  ],
  tickets_event: [
    { id: "ticket-price", label: "A fair ticket price", group: "budget" },
    { id: "commitment", label: "A comfortable commitment", group: "timing" },
    { id: "seat-location", label: "Seats worth the price", group: "logistics" },
    { id: "backup-plan", label: "A backup if people are unsure", group: "logistics" }
  ],
  group_trip: [
    { id: "total-cost", label: "A realistic total cost", group: "budget" },
    { id: "dates", label: "Dates that work for everyone", group: "timing" },
    { id: "travel-load", label: "Manageable travel time", group: "access" },
    { id: "planning-detail", label: "Clearer plan details", group: "logistics" }
  ],
  home_chill: [
    { id: "host-effort", label: "Reasonable effort for the host", group: "logistics" },
    { id: "food-drink", label: "Clear food and drinks", group: "food" },
    { id: "quiet-night", label: "A relaxed night", group: "vibe" },
    { id: "arrival-window", label: "A flexible arrival time", group: "timing" }
  ],
  custom: [
    { id: "budget-check", label: "A comfortable budget", group: "budget" },
    { id: "timing-check", label: "Timing that works", group: "timing" },
    { id: "location-check", label: "A manageable location", group: "access" },
    { id: "vibe-check", label: "The right vibe", group: "vibe" }
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

function safeActivityType(activityType: ActivityType): ActivityType {
  return ACTIVITY_TYPES.includes(activityType) ? activityType : "custom";
}

// Deterministic thousands separators (locale-independent) so "$2k" reads as "$2,000".
function formatAmount(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function activityLabel(activityType: ActivityType): string {
  return ACTIVITY_LABELS[safeActivityType(activityType)];
}

// Strip a dangling unpaired UTF-16 surrogate left behind by a code-unit slice,
// so a truncated title never ends in a broken glyph.
function trimDanglingSurrogate(value: string): string {
  const lastCode = value.charCodeAt(value.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return value.slice(0, -1);
  }
  return value;
}

export function normalizeTitle(title: string): string {
  const normalized = title
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^[\p{P}\p{S}\s]+$/u.test(normalized)) {
    return "Untitled Comfort Check";
  }
  return trimDanglingSurrogate([...normalized].slice(0, 90).join("")).trim();
}

// Idea text is shown to the host and embedded in share copy; strip the same
// HTML-ish characters and links we strip from titles for defense-in-depth.
function sanitizeIdea(idea: string): string {
  return idea
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  // A percentage ("50%", "20% off") is not a price.
  if (/\d\s*%/.test(lowered)) {
    return { state: "ambiguous", raw: value };
  }
  // Scientific notation ("1e9") is too ambiguous to price confidently.
  if (/\d\s*e\s*\d/i.test(lowered)) {
    return { state: "ambiguous", raw: value };
  }
  // A signed-negative number is never a valid price.
  if (/-\s*\$?\s*\.?\d/.test(lowered)) {
    return { state: "malformed", raw: value };
  }
  // A range or multi-number string ("$10 and $300", "between $20 and $40") is not a
  // single price; classifying it by the first number would skew the comfort signal.
  if ((lowered.match(/\d[\d.,]*/g) || []).length > 1) {
    return { state: "ambiguous", raw: value };
  }

  const match = lowered.match(/\$?\s*([\d.,]+)\s*(k)?/);
  if (!match || !/\d/.test(match[1] ?? "")) {
    return /[a-z]/i.test(value) ? { state: "ambiguous", raw: value } : { state: "malformed", raw: value };
  }

  const numStr = match[1] ?? "";
  // Reject mistyped numbers: multiple decimal points, or commas that do not form
  // clean thousands groups (e.g. "$1,00", "$1,0000").
  const hasComma = numStr.includes(",");
  if (numStr.split(".").length > 2) {
    return { state: "malformed", raw: value };
  }
  if (hasComma && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numStr)) {
    return { state: "ambiguous", raw: value };
  }

  const numeric = numStr.replace(/,/g, "");
  const multiplier = match[2] === "k" ? 1000 : 1;
  const amount = Number(numeric) * multiplier;
  if (!Number.isFinite(amount) || amount < 0) {
    return { state: "malformed", raw: value };
  }

  const perPerson = /(per ?person|\/ ?person|pp\b|\beach\b|\bsplit\b)/.test(lowered);
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
    return { id: "price-flexible", label: "Flexible on cost", group: "budget" };
  }
  if (price.state === "free") {
    return { id: "free-still-comfortable", label: "Worth the time, even if it's free", group: "timing" };
  }
  if (price.state === "high" || price.state === "extreme") {
    // Neutral topic phrase (not an affirmation) so it reads correctly both as a
    // "what would make this easier?" option and when surfaced as a flagged concern.
    const amount = price.amount ? formatAmount(price.amount) : undefined;
    const label = amount ? `The $${amount}${price.perPerson ? "/person" : ""} price` : "The price";
    return { id: "price-high", label, group: "budget" };
  }
  if (price.state === "ambiguous" || price.state === "malformed") {
    return { id: "price-clarity", label: "Clearer price details", group: "budget" };
  }
  return undefined;
}

function vibeConstraint(vibe?: Vibe): ComfortConstraint | undefined {
  if (!vibe || !VIBES.includes(vibe)) {
    return undefined;
  }
  const label = VIBE_LABELS[vibe];
  const article = /^[aeiou]/i.test(label) ? "An" : "A";
  return {
    id: `vibe-${vibe}`,
    label: `${article} ${label} vibe`,
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
  const activityType = safeActivityType(input.activityType);
  const title = normalizeTitle(input.title);
  const price = parsePrice(input.currentIdea);
  const activity = activityLabel(activityType);
  const idea = input.currentIdea ? sanitizeIdea(input.currentIdea) || undefined : undefined;
  const safeVibe = input.vibe && VIBES.includes(input.vibe) ? input.vibe : undefined;
  const vibeArticle = safeVibe && /^[aeiou]/i.test(VIBE_LABELS[safeVibe]) ? "an" : "a";
  const vibeText = safeVibe ? ` Going for ${vibeArticle} ${VIBE_LABELS[safeVibe]} vibe.` : "";
  const extraConstraints = [priceConstraint(price), vibeConstraint(input.vibe)].filter(
    (constraint): constraint is ComfortConstraint => Boolean(constraint)
  );
  const constraints = uniqueConstraints([
    ...extraConstraints,
    ...ACTIVITY_CONSTRAINTS[activityType],
    ...customConstraintRows(plan, input.customConstraints)
  ]).slice(0, plan === "premium" ? 16 : 8);

  const shareText = `${title}: a quick, private Comfort Check before we lock it in.${vibeText}${
    idea ? ` Current idea: ${idea}.` : ""
  } Your answer stays private.`;

  return {
    title,
    activityType,
    activityLabel: activity,
    ...(safeVibe ? { vibe: safeVibe } : {}),
    currentIdea: idea,
    price,
    questions: DEFAULT_QUESTIONS.map((question) => ({ ...question })),
    tiers: BASE_TIERS.map((tier) => ({ ...tier })),
    constraints,
    privacyCopy:
      "Your response is private. The host sees grouped comfort patterns and constraints, not named budget answers or private notes.",
    shareText,
    resultIntro: `Sayable will summarize whether ${title} feels easy, workable with tweaks, or worth rethinking.`,
    finalSharePrompt: `Send the group the clearest next step for ${title}, without calling anyone out.`
  };
}
