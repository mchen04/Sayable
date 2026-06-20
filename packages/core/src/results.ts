import type { ComfortDraft, GuestResponse, ResultSummary, ResponseStatus } from "./types";

const PRIVACY_THRESHOLD = 4;
const CONSTRAINT_PRIVACY_THRESHOLD = 4;

const STATUS_SCORE: Record<ResponseStatus, number> = {
  in: 3,
  maybe: 1.75,
  out: 0
};

type Verdict = "suppressed" | "easy_yes" | "tweaks" | "rethink" | "split";

// Auto-injected constraints that describe the host's own preference/reassurance
// ("Going for an adventurous vibe", "Flexible on cost", "Worth the time, even if
// it's free") rather than a guest concern. They read fine as pickable options but
// backwards when surfaced as "… mattered to most people", so they are excluded from
// the single headline constraint referenced in the final message and snapshot.
function isPreferenceConstraint(id: string): boolean {
  return id === "price-flexible" || id === "free-still-comfortable" || id.startsWith("vibe-");
}

function activeResponses(responses: GuestResponse[]): GuestResponse[] {
  return responses.filter((response) => response && !response.deletedAt && response.status in STATUS_SCORE);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function responseScore(response: GuestResponse, draft: ComfortDraft): number {
  const tier = (draft.tiers ?? []).find((candidate) => candidate.id === response.tierId);
  // If the tier was renamed/removed after this response was recorded, or its
  // score is corrupted (NaN/Infinity), derive the comfort score from the
  // response status instead of a neutral constant so the verdict stays correct.
  const tierScore = tier && Number.isFinite(tier.score) ? tier.score : STATUS_SCORE[response.status];
  return average([STATUS_SCORE[response.status], tierScore]);
}

function chooseBestFit(
  counts: Record<ResponseStatus, number>,
  avgScore: number,
  suppressed: boolean
): { verdict: Verdict; label: string; detail: string; tone: ResultSummary["bestFit"]["tone"] } {
  if (suppressed) {
    return {
      verdict: "suppressed",
      label: "Waiting on a few more responses",
      detail: `Sayable needs at least ${PRIVACY_THRESHOLD} responses before showing detailed patterns.`,
      tone: "neutral"
    };
  }
  if (avgScore >= 2.45 && counts.maybe === 0 && counts.out === 0) {
    return {
      verdict: "easy_yes",
      label: "Easy yes for the group",
      detail: "The responses point toward this plan feeling comfortable as-is.",
      tone: "green"
    };
  }
  if (avgScore >= 1.65 && counts.in + counts.maybe >= counts.out) {
    return {
      verdict: "tweaks",
      label: "Works with a few tweaks",
      detail: "There is enough interest, but the constraints matter before locking it in.",
      tone: "yellow"
    };
  }
  if (counts.out > counts.in + counts.maybe) {
    return {
      verdict: "rethink",
      label: "Rethink the plan",
      detail: "More people are uncomfortable than comfortable. A lighter option is likely better.",
      tone: "red"
    };
  }
  return {
    verdict: "split",
    label: "Split comfort",
    detail: "The group is mixed. Choose the lower-pressure version or ask one focused follow-up.",
    tone: "yellow"
  };
}

function comfortRange(draft: ComfortDraft, responses: GuestResponse[], suppressed: boolean) {
  if (responses.length === 0) {
    return {
      label: "No signal yet",
      detail: "Share the link to start seeing the comfort range."
    };
  }
  if (suppressed) {
    return {
      label: `Private until ${PRIVACY_THRESHOLD} responses`,
      detail: `Detailed comfort range is hidden until ${PRIVACY_THRESHOLD} responses to avoid exposing small-group answers.`
    };
  }

  const scores = responses.map((response) => responseScore(response, draft));
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  if (low >= 2.4) {
    return { label: "Comfortable", detail: "Responses cluster around an easy yes." };
  }
  if (high <= 1) {
    return { label: "Uncomfortable", detail: "Responses cluster around not comfortable." };
  }
  // Everyone landed in the same middle band (e.g. all "maybe") — that is a
  // consistent "workable", not a split. Only call it mixed when the spread is wide.
  if (low >= 1 && high <= 2.4) {
    return { label: "Workable", detail: "Responses cluster around workable with a few tweaks." };
  }
  return { label: "Mixed", detail: "Some guests are comfortable, while others need changes." };
}

function groupedConstraints(
  draft: ComfortDraft,
  responses: GuestResponse[],
  suppressed: boolean
): ResultSummary["groupedConstraints"] {
  if (suppressed) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const response of responses) {
    for (const id of new Set(Array.isArray(response.constraintIds) ? response.constraintIds : [])) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const constraints = draft.constraints ?? [];
  return Array.from(counts.entries())
    .flatMap(([id, count]) => {
      const constraint = constraints.find((candidate) => candidate.id === id);
      if (!constraint || count < CONSTRAINT_PRIVACY_THRESHOLD) {
        return [];
      }
      const share = responses.length === 0 ? 0 : count / responses.length;
      const signal: ResultSummary["groupedConstraints"][number]["signal"] =
        share >= 0.75 ? "broad" : share >= 0.5 ? "strong" : "common";
      return {
        id,
        label: constraint.label,
        group: constraint.group,
        signal,
        detail:
          signal === "broad"
            ? "Most of the group"
            : signal === "strong"
              ? "Around half the group"
              : "Several people"
      };
    })
    .sort((a, b) => {
      const rank: Record<ResultSummary["groupedConstraints"][number]["signal"], number> = { broad: 3, strong: 2, common: 1 };
      return rank[b.signal] - rank[a.signal] || a.label.localeCompare(b.label);
    });
}

function currentIdeaWarning(draft: ComfortDraft, responses: GuestResponse[], suppressed: boolean): string | undefined {
  if (!draft.currentIdea) {
    return undefined;
  }
  const maybeOrOut = responses.filter((response) => response.status !== "in").length;
  const priceState = draft.price?.state;
  if (priceState === "high" || priceState === "extreme") {
    if (suppressed) {
      return "The current idea has a higher cost, so Sayable is keeping detailed budget signal private until more responses arrive.";
    }
    // Don't contradict a unanimous yes: if everyone is comfortable, the higher
    // cost is clearly not the pressure point.
    if (maybeOrOut === 0) {
      return undefined;
    }
    return "The current idea may be the pressure point. Consider a cheaper or more flexible version before booking.";
  }
  if (suppressed) {
    return undefined;
  }
  if (maybeOrOut / Math.max(responses.length, 1) >= 0.45) {
    return "The current idea is not an automatic yes. Use the constraints before making it final.";
  }
  return undefined;
}

// A verdict-aware closing line so the final message reflects the actual result
// instead of a generic, sometimes-contradictory sign-off.
const FINAL_MESSAGE_CLOSERS: Record<Exclude<Verdict, "suppressed">, string> = {
  easy_yes: "Locking it in.",
  tweaks: "I'll firm up the details and confirm.",
  rethink: "I'll look at a lighter option and re-share.",
  split: "I'll go with the lower-pressure version."
};

const PUBLIC_SNAPSHOT_DETAIL: Record<Exclude<Verdict, "suppressed">, string> = {
  easy_yes: "Mostly a comfortable yes across the group.",
  tweaks: "Soft yes — a couple of things to sort out first.",
  rethink: "Leaning no for now — looking at a lighter option.",
  split: "Pretty mixed — leaning toward a lower-pressure version."
};

// Public comfort word keyed to the verdict so the shared snapshot never shows a
// raw range label (e.g. "mixed") that contradicts the headline (e.g. "Rethink").
const PUBLIC_COMFORT_WORD: Record<Exclude<Verdict, "suppressed">, string> = {
  easy_yes: "comfortable",
  tweaks: "workable",
  rethink: "leaning no",
  split: "mixed"
};

export function calculateResultSummary(draft: ComfortDraft, responses: GuestResponse[]): ResultSummary {
  const active = activeResponses(Array.isArray(responses) ? responses : []);
  const responseCount = active.length;
  const isPrivacySuppressed = responseCount < PRIVACY_THRESHOLD;
  const counts: Record<ResponseStatus, number> = { in: 0, maybe: 0, out: 0 };
  for (const response of active) {
    counts[response.status] += 1;
  }
  const avgScore = average(active.map((response) => responseScore(response, draft)));
  const fit = chooseBestFit(counts, avgScore, isPrivacySuppressed);
  const bestFit = { label: fit.label, detail: fit.detail, tone: fit.tone };
  const range = comfortRange(draft, active, isPrivacySuppressed);
  const grouped = groupedConstraints(draft, active, isPrivacySuppressed);
  const warning = currentIdeaWarning(draft, active, isPrivacySuppressed);
  const headlineConstraint = grouped.find((constraint) => !isPreferenceConstraint(constraint.id));

  // On a clean "easy yes" there is no concern to surface, so naming a flagged
  // constraint reads as needless bureaucracy; reserve it for the other verdicts.
  const showFlag = Boolean(headlineConstraint) && fit.verdict !== "suppressed" && fit.verdict !== "easy_yes";
  // Engine constraint labels are clean noun phrases ("the $X price") that read
  // correctly in "X mattered to most people". Host-authored custom labels are
  // arbitrary text, so quote them instead of splicing them into that sentence.
  const flagSentence = (constraint: NonNullable<typeof headlineConstraint>): string =>
    constraint.group === "custom"
      ? `Several people flagged "${constraint.label}". `
      : `${constraint.label} mattered to most people. `;
  const finalMessage =
    fit.verdict === "suppressed"
      ? `Quick update on ${draft.title}: I'm waiting on a few more private responses before locking anything in.`
      : `Quick update on ${draft.title}: ${fit.label.toLowerCase()}. ${
          showFlag ? flagSentence(headlineConstraint!) : ""
        }${FINAL_MESSAGE_CLOSERS[fit.verdict]}`;

  return {
    responseCount,
    privacyThreshold: PRIVACY_THRESHOLD,
    isPrivacySuppressed,
    bestFit,
    comfortRange: range,
    currentIdeaWarning: warning,
    groupedConstraints: grouped,
    finalMessage,
    publicSnapshot: {
      tone: bestFit.tone,
      headline: isPrivacySuppressed ? "Comfort Check in progress" : bestFit.label,
      detail:
        fit.verdict === "suppressed"
          ? "Detailed results stay private until enough responses are in."
          : PUBLIC_SNAPSHOT_DETAIL[fit.verdict],
      safeStats: isPrivacySuppressed
        ? [`${responseCount} response${responseCount === 1 ? "" : "s"} received`]
        : [
            `${responseCount} private responses`,
            `Comfort: ${fit.verdict === "suppressed" ? range.label.toLowerCase() : PUBLIC_COMFORT_WORD[fit.verdict]}`,
            showFlag
              ? headlineConstraint!.group === "custom"
                ? `Top priority: "${headlineConstraint!.label}"`
                : `Top priority: ${headlineConstraint!.label.toLowerCase()}`
              : "No dealbreakers surfaced"
          ]
    }
  };
}
