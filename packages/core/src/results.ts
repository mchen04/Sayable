import type { ComfortConstraint, ComfortDraft, GuestResponse, ResultSummary, ResponseStatus } from "./types";

const PRIVACY_THRESHOLD = 4;
const CONSTRAINT_PRIVACY_THRESHOLD = 4;

const STATUS_SCORE: Record<ResponseStatus, number> = {
  in: 3,
  maybe: 1.75,
  out: 0
};

function activeResponses(responses: GuestResponse[]): GuestResponse[] {
  return responses.filter((response) => !response.deletedAt && response.status in STATUS_SCORE);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function responseScore(response: GuestResponse, draft: ComfortDraft): number {
  const tier = draft.tiers.find((candidate) => candidate.id === response.tierId);
  return average([STATUS_SCORE[response.status], tier?.score ?? 1.5]);
}

function chooseBestFit(counts: Record<ResponseStatus, number>, avgScore: number, suppressed: boolean) {
  if (suppressed) {
      return {
      label: "Gathering comfort signal",
      detail: `Sayable needs at least ${PRIVACY_THRESHOLD} responses before showing detailed patterns.`,
      tone: "neutral" as const
    };
  }
  if (avgScore >= 2.45 && counts.maybe === 0 && counts.out === 0) {
    return {
      label: "Easy yes for the group",
      detail: "The responses point toward this plan feeling comfortable as-is.",
      tone: "green" as const
    };
  }
  if (avgScore >= 1.65 && counts.in + counts.maybe >= counts.out) {
    return {
      label: "Works with a few tweaks",
      detail: "There is enough interest, but the constraints matter before locking it in.",
      tone: "yellow" as const
    };
  }
  if (counts.out > counts.in + counts.maybe) {
    return {
      label: "Rethink the plan",
      detail: "More people are uncomfortable than comfortable. A lighter option is likely better.",
      tone: "red" as const
    };
  }
  return {
    label: "Split comfort",
    detail: "The group is mixed. Choose the lower-pressure version or ask one focused follow-up.",
    tone: "yellow" as const
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
    for (const id of new Set(response.constraintIds)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .flatMap(([id, count]) => {
      const constraint = draft.constraints.find((candidate) => candidate.id === id);
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
            ? "Broad private pattern"
            : signal === "strong"
              ? "Strong private pattern"
              : "Common private pattern"
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
  if (draft.price.state === "high" || draft.price.state === "extreme") {
    return suppressed
      ? "The current idea has a higher cost, so Sayable is keeping detailed budget signal private until more responses arrive."
      : "The current idea may be the pressure point. Consider a cheaper or more flexible version before booking.";
  }
  if (suppressed) {
    return undefined;
  }
  const maybeOrOut = responses.filter((response) => response.status !== "in").length;
  if (maybeOrOut / Math.max(responses.length, 1) >= 0.45) {
    return "The current idea is not an automatic yes. Use the constraints before making it final.";
  }
  return undefined;
}

export function calculateResultSummary(draft: ComfortDraft, responses: GuestResponse[]): ResultSummary {
  const active = activeResponses(responses);
  const responseCount = active.length;
  const isPrivacySuppressed = responseCount < PRIVACY_THRESHOLD;
  const counts: Record<ResponseStatus, number> = { in: 0, maybe: 0, out: 0 };
  for (const response of active) {
    counts[response.status] += 1;
  }
  const avgScore = average(active.map((response) => responseScore(response, draft)));
  const bestFit = chooseBestFit(counts, avgScore, isPrivacySuppressed);
  const range = comfortRange(draft, active, isPrivacySuppressed);
  const grouped = groupedConstraints(draft, active, isPrivacySuppressed);
  const warning = currentIdeaWarning(draft, active, isPrivacySuppressed);

  const finalMessage = isPrivacySuppressed
    ? `Quick update on ${draft.title}: I am waiting for a few more private responses before locking anything in.`
    : `Quick update on ${draft.title}: ${bestFit.label.toLowerCase()}. ${
        grouped[0] ? `Main thing to account for: ${grouped[0].label.toLowerCase()}. ` : ""
      }I will choose the version that keeps this easy for the group.`;

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
      headline: isPrivacySuppressed ? "Comfort Check in progress" : bestFit.label,
      detail: isPrivacySuppressed
        ? "Detailed results stay private until enough responses are in."
        : "The host can share the group-safe takeaway without exposing individual answers.",
      safeStats: isPrivacySuppressed
        ? [`${responseCount} response${responseCount === 1 ? "" : "s"} received`]
        : [`${responseCount} private responses`, range.label, grouped[0] ? "Common constraints surfaced" : "No common blocker surfaced"]
    }
  };
}
