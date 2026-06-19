import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  calculateResultSummary,
  createComfortDraft,
  defaultThemeForActivity,
  getPlanLimits,
  parsePrice,
  type GuestResponse,
  type ResponseStatus,
  THEMES
} from "../src";

const now = "2026-06-19T08:00:00.000Z";

function response(status: ResponseStatus, tierId: string, constraintIds: string[] = []): GuestResponse {
  return {
    status,
    tierId,
    constraintIds,
    createdAt: now
  };
}

describe("deterministic auto-draft engine", () => {
  it.each(ACTIVITY_TYPES)("generates a complete Comfort Check for %s", (activityType) => {
    const draft = createComfortDraft({
      title: `${activityType} plan`,
      activityType,
      currentIdea: "$48 per person",
      vibe: "low_key"
    });

    expect(draft.title).toContain("plan");
    expect(draft.questions).toHaveLength(3);
    expect(draft.tiers.map((tier) => tier.id)).toEqual(["easy_yes", "works_with_tweaks", "not_comfortable"]);
    expect(draft.constraints.length).toBeGreaterThanOrEqual(5);
    expect(draft.privacyCopy).toMatch(/private/i);
    expect(draft.shareText).toMatch(/Comfort Check/);
  });

  it("normalizes dangerous or unusable titles into safe copy", () => {
    expect(createComfortDraft({ title: "<script>alert(1)</script>", activityType: "custom" }).title).not.toContain("<");
    expect(createComfortDraft({ title: "!!!", activityType: "custom" }).title).toBe("Untitled Comfort Check");
    expect(createComfortDraft({ title: "Dinner https://evil.example", activityType: "dinner_drinks" }).title).toBe("Dinner");
  });

  it("parses price states without throwing on weird input", () => {
    expect(parsePrice(undefined).state).toBe("none");
    expect(parsePrice("free").state).toBe("free");
    expect(parsePrice("$12 each").state).toBe("low");
    expect(parsePrice("$65 per person").state).toBe("normal");
    expect(parsePrice("$175").state).toBe("high");
    expect(parsePrice("$9999 total maybe").state).toBe("extreme");
    expect(parsePrice("$1,200 total").amount).toBe(1200);
    expect(parsePrice("$12,000 total").state).toBe("extreme");
    expect(parsePrice("1.2k per person").amount).toBe(1200);
    expect(parsePrice("depends on surge pricing").state).toBe("ambiguous");
    expect(parsePrice("???").state).toBe("malformed");
  });

  it("is stable for repeated identical inputs", () => {
    const input = {
      title: "Rooftop drinks Friday",
      activityType: "dinner_drinks" as ActivityType,
      currentIdea: "$38/person",
      vibe: "polished" as const
    };
    expect(createComfortDraft(input)).toEqual(createComfortDraft(input));
  });
});

describe("privacy-safe result engine", () => {
  it("suppresses detailed aggregates below the privacy threshold", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    const summary = calculateResultSummary(draft, [
      response("in", "easy_yes", [draft.constraints[0]!.id]),
      response("out", "not_comfortable", [draft.constraints[1]!.id]),
      response("maybe", "works_with_tweaks", [draft.constraints[1]!.id])
    ]);

    expect(summary.responseCount).toBe(3);
    expect(summary.isPrivacySuppressed).toBe(true);
    expect(summary.groupedConstraints).toEqual([]);
    expect(summary.finalMessage).not.toMatch(/budget|named|out/i);
  });

  it("aggregates without named answers once enough responses exist", () => {
    const draft = createComfortDraft({
      title: "Birthday dinner",
      activityType: "birthday",
      currentIdea: "$90/person"
    });
    const budgetConstraint = draft.constraints.find((constraint) => constraint.group === "budget")!;
    const summary = calculateResultSummary(draft, [
      response("in", "easy_yes", [budgetConstraint.id]),
      response("maybe", "works_with_tweaks", [budgetConstraint.id]),
      response("maybe", "works_with_tweaks", [budgetConstraint.id]),
      response("out", "not_comfortable", [budgetConstraint.id])
    ]);

    expect(summary.isPrivacySuppressed).toBe(false);
    expect(summary.bestFit.label).toBe("Works with a few tweaks");
    expect(summary.currentIdeaWarning).toMatch(/cheaper|flexible|pressure/i);
    expect(summary.groupedConstraints[0]).toMatchObject({
      id: budgetConstraint.id,
      signal: "broad",
      detail: "Broad private pattern"
    });
    expect(summary.finalMessage).not.toMatch(/Alice|Bob|private note/i);
  });

  it("hides one-person constraint signals even when overall results unlock", () => {
    const draft = createComfortDraft({ title: "Small dinner", activityType: "dinner_drinks" });
    const rareConstraint = draft.constraints[0]!;
    const summary = calculateResultSummary(draft, [
      response("in", "easy_yes", [rareConstraint.id]),
      response("in", "easy_yes", []),
      response("maybe", "works_with_tweaks", []),
      response("out", "not_comfortable", [])
    ]);

    expect(summary.responseCount).toBe(4);
    expect(summary.isPrivacySuppressed).toBe(false);
    expect(summary.groupedConstraints).toEqual([]);
    expect(JSON.stringify(summary.publicSnapshot)).not.toContain(rareConstraint.label);
  });

  it("ignores deleted responses exactly once", () => {
    const draft = createComfortDraft({ title: "Trip", activityType: "group_trip" });
    const deleted: GuestResponse = {
      ...response("out", "not_comfortable", [draft.constraints[0]!.id]),
      deletedAt: now
    };
    const summary = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      deleted
    ]);

    expect(summary.responseCount).toBe(4);
    expect(summary.bestFit.label).toBe("Easy yes for the group");
  });

  it("does not call mixed maybe responses an easy yes", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    const summary = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("maybe", "easy_yes"),
      response("in", "easy_yes")
    ]);

    expect(summary.isPrivacySuppressed).toBe(false);
    expect(summary.bestFit.label).toBe("Works with a few tweaks");
  });
});

describe("scenario matrix and invariants", () => {
  const guestCounts = [0, 1, 2, 3, 5, 10, 30, 31, 100, 101];
  const mixes: ResponseStatus[][] = [
    ["in"],
    ["out"],
    ["maybe"],
    ["in", "in", "maybe", "out"],
    ["out", "out", "maybe", "in"],
    ["in", "out"],
    ["in", "maybe", "out"]
  ];
  const prices = [undefined, "free", "$12 each", "$45", "$150/person", "$900 total", "depends", "???"];

  it("covers activity x price x response matrix without crashes or privacy failures", () => {
    for (const activityType of ACTIVITY_TYPES) {
      for (const currentIdea of prices) {
        const draft = createComfortDraft({
          title: `Matrix ${activityType}`,
          activityType,
          currentIdea,
          vibe: "spontaneous"
        });
        for (const count of guestCounts) {
          for (const mix of mixes) {
            const responses = Array.from({ length: count }, (_, index) => {
              const status = mix[index % mix.length]!;
              const tierId =
                status === "in" ? "easy_yes" : status === "maybe" ? "works_with_tweaks" : "not_comfortable";
              const selected = index % 3 === 0 ? [draft.constraints[index % draft.constraints.length]!.id] : [];
              return response(status, tierId, selected);
            });
            const summary = calculateResultSummary(draft, responses);
            expect(summary.responseCount).toBe(count);
            if (count < 4) {
              expect(summary.isPrivacySuppressed).toBe(true);
              expect(summary.groupedConstraints).toHaveLength(0);
            }
            expect(summary.finalMessage).toMatch(draft.title);
            expect(summary.publicSnapshot.safeStats.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("keeps free and premium hard limits explicit", () => {
    expect(getPlanLimits("free")).toMatchObject({
      maxResponsesPerCheck: 30,
      maxCustomConstraints: 2,
      retentionDays: 30
    });
    expect(getPlanLimits("premium")).toMatchObject({
      maxResponsesPerCheck: 100,
      maxCustomConstraints: 10,
      retentionDays: 180
    });
  });

  it("ships all required starter themes and gates premium themes", () => {
    expect(THEMES.map((theme) => theme.name)).toEqual([
      "Sayable Default",
      "Dinner/Drinks",
      "Birthday",
      "Night Out",
      "Trip",
      "Cozy/Home"
    ]);
    expect(THEMES.filter((theme) => theme.premium)).toHaveLength(5);
  });

  it("defines deterministic premium theme defaults by activity type", () => {
    expect(ACTIVITY_TYPES.map((activityType) => [activityType, defaultThemeForActivity(activityType)])).toEqual([
      ["dinner_drinks", "dinner_drinks"],
      ["birthday", "birthday"],
      ["casual_hangout", "night_out"],
      ["tickets_event", "night_out"],
      ["group_trip", "trip"],
      ["home_chill", "cozy_home"],
      ["custom", "sayable_default"]
    ]);
  });
});
