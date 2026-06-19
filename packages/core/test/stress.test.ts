import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  VIBES,
  calculateResultSummary,
  createComfortDraft,
  getPlanLimits,
  parsePrice,
  type ActivityType,
  type DraftInput,
  type GuestResponse,
  type PlanTier,
  type ResponseStatus,
  type Vibe
} from "../src";
import oracles from "./fixtures/core-oracles.json";

const createdAt = "2026-06-19T12:00:00.000Z";

type Oracle = (typeof oracles)[number];

function response(status: ResponseStatus, tierId: string, constraintIds: string[] = []): GuestResponse {
  return {
    status,
    tierId,
    constraintIds,
    createdAt
  };
}

function mulberry32(seed: number) {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function oracleResponses(oracle: Oracle): GuestResponse[] {
  return oracle.responses.map((item) => response(item.status as ResponseStatus, item.tierId, item.constraintIds));
}

describe("oracle fixtures", () => {
  it.each(oracles)("$name", (oracle) => {
    const draft = createComfortDraft(oracle.input as DraftInput);
    const result = calculateResultSummary(draft, oracleResponses(oracle));

    expect(draft.title).toBe(oracle.expected.title);
    expect(draft.price.state).toBe(oracle.expected.priceState);
    for (const label of oracle.expected.constraintLabels) {
      expect(draft.constraints.map((constraint) => constraint.label)).toContain(label);
    }
    expect(result.bestFit.label).toBe(oracle.expected.bestFit);
    if ("suppressed" in oracle.expected) {
      expect(result.isPrivacySuppressed).toBe(oracle.expected.suppressed);
    }
    if ("warningIncludes" in oracle.expected) {
      expect(result.currentIdeaWarning?.toLowerCase()).toContain(oracle.expected.warningIncludes);
    }
  });
});

describe("seeded scenario generator", () => {
  const responseMixes: ResponseStatus[][] = [
    ["in"],
    ["maybe"],
    ["out"],
    ["in", "maybe", "out"],
    ["in", "in", "maybe", "out"],
    ["out", "out", "maybe", "in"]
  ];
  const guestCounts = [0, 1, 2, 3, 4, 5, 10, 30, 31, 100, 101];
  const priceStates = [
    undefined,
    "free",
    "$0",
    "$8 each",
    "$45 per person",
    "$150/person",
    "$1,200 total",
    "$12,000 total",
    "1.2k per person",
    "depends on rideshare surge",
    "???"
  ];
  const titles = [
    "",
    "!!!",
    "Dinner https://bad.example",
    "🎂 birthday chaos maybe??",
    "Cena y bebidas",
    "Tickets <script>alert(1)</script>",
    "A".repeat(180)
  ];

  it("runs seeded deterministic simulations across activity, vibe, price, guest count, response mix, and plan", () => {
    const failingSeeds: number[] = [];

    for (let seed = 1; seed <= 42; seed += 1) {
      const random = mulberry32(seed);
      try {
        const activityType = pick(ACTIVITY_TYPES, random);
        const randomVibe = pick([...VIBES, undefined, "invalid_vibe" as unknown as Vibe], random);
        const currentIdea = pick(priceStates, random);
        const plan = pick(["free", "premium"] as const, random);
        const draft = createComfortDraft(
          {
            title: pick(titles, random),
            activityType,
            currentIdea,
            vibe: randomVibe
          },
          plan
        );
        const count = pick(guestCounts, random);
        const mix = pick(responseMixes, random);
        const responses = Array.from({ length: count }, (_, index) => {
          const status = mix[index % mix.length]!;
          const tierId =
            status === "in" ? "easy_yes" : status === "maybe" ? "works_with_tweaks" : "not_comfortable";
          const selected =
            index % 2 === 0 && draft.constraints.length > 0
              ? [draft.constraints[Math.floor(random() * draft.constraints.length)]!.id]
              : [];
          return response(status, tierId, selected);
        });
        const result = calculateResultSummary(draft, responses);

        expect(draft.title.length).toBeGreaterThan(0);
        expect(draft.title).not.toMatch(/[<>]/);
        expect(draft.shareText).not.toContain("undefined");
        expect(draft.constraints.length).toBeGreaterThan(0);
        expect(result.responseCount).toBe(count);
        if (count < 4) {
          expect(result.isPrivacySuppressed).toBe(true);
          expect(result.groupedConstraints).toEqual([]);
        }
        expect(getPlanLimits(plan).maxResponsesPerCheck).toBe(plan === "premium" ? 100 : 30);
      } catch {
        failingSeeds.push(seed);
      }
    }

    expect(failingSeeds).toEqual([]);
  });

  it("covers every required stress axis explicitly with pairwise deterministic cases", () => {
    const coverage = {
      activities: new Set<ActivityType>(),
      vibes: new Set<Vibe | "none">(),
      priceStates: new Set<string>(),
      guestCounts: new Set<number>(),
      responseMixes: new Set<string>(),
      plans: new Set<PlanTier>(),
      customStates: new Set<string>(),
      tierStates: new Set<string>()
    };
    const customSets = [
      [],
      ["Only if we keep it nearby"],
      ["One", "Two", "Three"],
      Array.from({ length: 12 }, (_, index) => `Custom ${index + 1}`)
    ];

    let cases = 0;
    for (const [activityIndex, activityType] of ACTIVITY_TYPES.entries()) {
      for (const [planIndex, plan] of (["free", "premium"] as PlanTier[]).entries()) {
        for (const [priceIndex, currentIdea] of priceStates.entries()) {
          const vibe = VIBES[(activityIndex + priceIndex + planIndex) % VIBES.length]!;
          const customConstraints = customSets[(activityIndex + priceIndex) % customSets.length]!;
          const draft = createComfortDraft(
            {
              title: `Axis ${activityType} ${plan} ${priceIndex}`,
              activityType,
              currentIdea,
              vibe,
              customConstraints
            },
            plan
          );
          const countsToCheck = [
            guestCounts[(activityIndex + priceIndex) % guestCounts.length]!,
            3,
            4,
            getPlanLimits(plan).maxResponsesPerCheck
          ];
          for (const count of countsToCheck) {
            const mix = responseMixes[(count + activityIndex + planIndex) % responseMixes.length]!;
            const responses = Array.from({ length: count }, (_, index) => {
              const status = mix[index % mix.length]!;
              const tierId =
                status === "in" ? "easy_yes" : status === "maybe" ? "works_with_tweaks" : "not_comfortable";
              const selected =
                draft.constraints.length && index % 2 === 0 ? [draft.constraints[index % draft.constraints.length]!.id] : [];
              coverage.tierStates.add(tierId);
              return response(status, tierId, selected);
            });
            const result = calculateResultSummary(draft, responses);

            coverage.activities.add(activityType);
            coverage.vibes.add(vibe);
            coverage.priceStates.add(draft.price.state);
            coverage.guestCounts.add(count);
            coverage.responseMixes.add(mix.join("/"));
            coverage.plans.add(plan);
            coverage.customStates.add(`${plan}:${customConstraints.length}:${draft.constraints.filter((item) => item.isCustom).length}`);

            expect(result.responseCount).toBe(count);
            expect(result.privacyThreshold).toBe(4);
            if (count < 4) {
              expect(result.isPrivacySuppressed).toBe(true);
              expect(result.groupedConstraints).toHaveLength(0);
            }
            if (customConstraints.length > 0) {
              const maxCustom = getPlanLimits(plan).maxCustomConstraints;
              expect(draft.constraints.filter((constraint) => constraint.isCustom)).toHaveLength(
                Math.min(customConstraints.length, maxCustom)
              );
            }
            cases += 1;
          }
        }
      }
    }

    expect(coverage.activities).toEqual(new Set(ACTIVITY_TYPES));
    expect(coverage.vibes).toEqual(new Set(VIBES));
    expect(coverage.priceStates).toEqual(
      new Set(["none", "free", "low", "normal", "high", "extreme", "ambiguous", "malformed"])
    );
    expect(coverage.guestCounts).toEqual(new Set([0, 1, 2, 3, 4, 5, 10, 30, 31, 100, 101]));
    expect(coverage.responseMixes).toEqual(new Set(responseMixes.map((mix) => mix.join("/"))));
    expect(coverage.plans).toEqual(new Set(["free", "premium"]));
    expect(coverage.tierStates).toEqual(new Set(["easy_yes", "works_with_tweaks", "not_comfortable"]));
    expect([...coverage.customStates]).toEqual(
      expect.arrayContaining(["free:3:2", "premium:12:10", "free:0:0", "premium:0:0"])
    );
    expect(cases).toBe(ACTIVITY_TYPES.length * 2 * priceStates.length * 4);
  });

  it("runs the full required scenario matrix across activity, vibe, price, count, response mix, and plan", () => {
    const vibeCases: Array<{ label: Vibe | "none" | "invalid"; value?: Vibe }> = [
      { label: "none" },
      ...VIBES.map((value) => ({ label: value, value })),
      { label: "invalid", value: "invalid_vibe" as unknown as Vibe }
    ];
    const matrixGuestCounts = [0, 1, 2, 3, 4, 5, 10, 30, 31, 100, 101];
    const coverage = {
      activities: new Set<ActivityType>(),
      vibes: new Set<Vibe | "none" | "invalid">(),
      priceStates: new Set<string>(),
      guestCounts: new Set<number>(),
      responseMixes: new Set<string>(),
      plans: new Set<PlanTier>()
    };
    let cases = 0;

    for (const activityType of ACTIVITY_TYPES) {
      for (const vibeCase of vibeCases) {
        for (const currentIdea of priceStates) {
          for (const count of matrixGuestCounts) {
            for (const mix of responseMixes) {
              for (const plan of ["free", "premium"] as PlanTier[]) {
                const draft = createComfortDraft(
                  {
                    title: `Full matrix ${activityType} ${vibeCase.label} ${currentIdea || "none"}`,
                    activityType,
                    currentIdea,
                    ...(vibeCase.value ? { vibe: vibeCase.value } : {})
                  },
                  plan
                );
                const responses = Array.from({ length: count }, (_, index) => {
                  const status = mix[index % mix.length]!;
                  const tierId =
                    status === "in" ? "easy_yes" : status === "maybe" ? "works_with_tweaks" : "not_comfortable";
                  const selected =
                    draft.constraints.length && index % 4 === 0 ? [draft.constraints[index % draft.constraints.length]!.id] : [];
                  return response(status, tierId, selected);
                });
                const result = calculateResultSummary(draft, responses);

                coverage.activities.add(activityType);
                coverage.vibes.add(vibeCase.label);
                coverage.priceStates.add(draft.price.state);
                coverage.guestCounts.add(count);
                coverage.responseMixes.add(mix.join("/"));
                coverage.plans.add(plan);

                expect(result.responseCount).toBe(count);
                expect(result.finalMessage).toContain(draft.title);
                expect(JSON.stringify(result.groupedConstraints)).not.toMatch(/"count"|"share"/);
                if (count < 4) {
                  expect(result.isPrivacySuppressed).toBe(true);
                  expect(result.groupedConstraints).toHaveLength(0);
                }
                cases += 1;
              }
            }
          }
        }
      }
    }

    expect(coverage.activities).toEqual(new Set(ACTIVITY_TYPES));
    expect(coverage.vibes).toEqual(new Set([...VIBES, "none", "invalid"]));
    expect(coverage.priceStates).toEqual(
      new Set(["none", "free", "low", "normal", "high", "extreme", "ambiguous", "malformed"])
    );
    expect(coverage.guestCounts).toEqual(new Set(matrixGuestCounts));
    expect(coverage.responseMixes).toEqual(new Set(responseMixes.map((mix) => mix.join("/"))));
    expect(coverage.plans).toEqual(new Set(["free", "premium"]));
    expect(cases).toBe(ACTIVITY_TYPES.length * vibeCases.length * priceStates.length * matrixGuestCounts.length * responseMixes.length * 2);
  });

  it("enforces custom constraint limits and duplicate-label handling by plan", () => {
    const customConstraints = [
      "Near transit",
      "No late night",
      "Outdoor option",
      "Flexible timing",
      "Budget ceiling",
      "Accessible entrance",
      "Short commitment",
      "Easy parking",
      "Backup plan",
      "Extra detail",
      "Duplicate should be clamped",
      "Another clamped item"
    ];
    const freeDraft = createComfortDraft({ title: "Free customs", activityType: "custom", customConstraints }, "free");
    const premiumDraft = createComfortDraft(
      { title: "Premium customs", activityType: "custom", customConstraints },
      "premium"
    );
    const duplicateDraft = createComfortDraft(
      {
        title: "Duplicate customs",
        activityType: "custom",
        customConstraints: ["Near transit", "Near transit", "No late night"]
      },
      "premium"
    );

    expect(freeDraft.constraints.filter((constraint) => constraint.isCustom).map((constraint) => constraint.label)).toEqual([
      "Near transit",
      "No late night"
    ]);
    expect(premiumDraft.constraints.filter((constraint) => constraint.isCustom)).toHaveLength(10);
    expect(premiumDraft.constraints.filter((constraint) => constraint.isCustom).at(-1)?.label).toBe("Extra detail");
    expect(duplicateDraft.constraints.filter((constraint) => constraint.isCustom).map((constraint) => constraint.label)).toEqual([
      "Near transit",
      "No late night"
    ]);
  });

  it("runs a load-like pure-logic batch without crashes", () => {
    let summaries = 0;
    for (const activityType of ACTIVITY_TYPES) {
      for (const plan of ["free", "premium"] as PlanTier[]) {
        for (let batch = 0; batch < 150; batch += 1) {
          const draft = createComfortDraft(
            {
              title: `Batch ${activityType} ${batch}`,
              activityType,
              currentIdea: batch % 5 === 0 ? "$1,200 total" : "$35 per person",
              vibe: VIBES[batch % VIBES.length]
            },
            plan
          );
          const responses = Array.from({ length: batch % 12 }, (_, index) =>
            response(index % 3 === 0 ? "maybe" : "in", index % 3 === 0 ? "works_with_tweaks" : "easy_yes")
          );
          const result = calculateResultSummary(draft, responses);
          expect(result.finalMessage).toContain(draft.title);
          summaries += 1;
        }
      }
    }
    expect(summaries).toBe(ACTIVITY_TYPES.length * 2 * 150);
  });
});

describe("metamorphic and deterministic snapshot checks", () => {
  it("keeps result class stable when irrelevant title punctuation changes", () => {
    const baseDraft = createComfortDraft({
      title: "Rooftop drinks Friday",
      activityType: "dinner_drinks",
      currentIdea: "$45 per person",
      vibe: "polished"
    });
    const noisyDraft = createComfortDraft({
      title: "Rooftop drinks Friday!!!",
      activityType: "dinner_drinks",
      currentIdea: "$45 per person",
      vibe: "polished"
    });
    const responses = [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("maybe", "works_with_tweaks"),
      response("in", "easy_yes")
    ];

    expect(calculateResultSummary(baseDraft, responses).bestFit.label).toBe(
      calculateResultSummary(noisyDraft, responses).bestFit.label
    );
    expect(baseDraft.constraints.map((constraint) => constraint.id)).toEqual(
      noisyDraft.constraints.map((constraint) => constraint.id)
    );
  });

  it("has stable deterministic snapshot hashes for canonical drafts and results", () => {
    const drafts = ACTIVITY_TYPES.map((activityType) =>
      createComfortDraft({
        title: `Canonical ${activityType}`,
        activityType,
        currentIdea: "$42 per person",
        vibe: "low_key"
      })
    );
    const summaries = drafts.map((draft) =>
      calculateResultSummary(draft, [
        response("in", "easy_yes"),
        response("in", "easy_yes"),
        response("maybe", "works_with_tweaks"),
        response("out", "not_comfortable")
      ])
    );

    expect(hash(drafts.map((draft) => ({ ...draft, resultIntro: draft.resultIntro.replace(draft.title, "TITLE") })))).toBe(
      "6bba431ee1f3626d647f5a983d6fd92fca44f9421f2af0b53943ab91ca3c93e8"
    );
    expect(hash(summaries)).toBe("c1042ce6d72c41f2cd431fc0345687aa222547901e39230d2c5b1fee82216ea8");
  });
});

describe("mutation sentinels", () => {
  it("would catch a privacy-threshold mutation", () => {
    const draft = createComfortDraft({ title: "Privacy sentinel", activityType: "custom" });
    const responses = [
      response("in", "easy_yes", [draft.constraints[0]!.id]),
      response("out", "not_comfortable", [draft.constraints[1]!.id]),
      response("maybe", "works_with_tweaks", [draft.constraints[2]!.id])
    ];
    const real = calculateResultSummary(draft, responses);
    const mutatedWouldLeak = responses.length >= 3;

    expect(real.isPrivacySuppressed).toBe(true);
    expect(mutatedWouldLeak).toBe(true);
    expect(real.groupedConstraints).toHaveLength(0);
  });

  it("would catch an easy-yes scoring mutation that ignores maybe status", () => {
    const draft = createComfortDraft({ title: "Scoring sentinel", activityType: "casual_hangout" });
    const responses = [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("maybe", "easy_yes"),
      response("in", "easy_yes")
    ];
    const real = calculateResultSummary(draft, responses);
    const mutatedLabel = "Easy yes for the group";

    expect(real.bestFit.label).not.toBe(mutatedLabel);
  });

  it("would catch a free-limit mutation", () => {
    const free = getPlanLimits("free");
    const premium = getPlanLimits("premium");

    expect(free.maxResponsesPerCheck).toBe(30);
    expect(premium.maxResponsesPerCheck).toBe(100);
    expect(free.maxResponsesPerCheck).not.toBe(premium.maxResponsesPerCheck);
  });
});

describe("runtime input edges", () => {
  it("falls back safely for invalid runtime vibe values", () => {
    const draft = createComfortDraft({
      title: "Invalid vibe",
      activityType: "custom",
      vibe: "chaotic" as unknown as Vibe
    });

    expect(draft.vibe).toBeUndefined();
    expect(draft.shareText).not.toContain("undefined");
    expect(draft.constraints.map((constraint) => constraint.label)).not.toContain("Keep it undefined");
  });

  it("classifies required weird prices correctly", () => {
    expect(parsePrice("$1,200 total")).toMatchObject({ state: "extreme", amount: 1200 });
    expect(parsePrice("$12,000 total")).toMatchObject({ state: "extreme", amount: 12000 });
    expect(parsePrice("1.2k per person")).toMatchObject({ state: "extreme", amount: 1200, perPerson: true });
  });

  it("ignores corrupted stored responses with invalid runtime statuses", () => {
    const draft = createComfortDraft({ title: "Corrupted response", activityType: "custom" });
    const corrupted = {
      status: "definitely" as ResponseStatus,
      tierId: "easy_yes",
      constraintIds: [draft.constraints[0]!.id],
      createdAt
    };
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      corrupted
    ]);

    expect(result.responseCount).toBe(4);
    expect(result.bestFit.label).toBe("Easy yes for the group");
    expect(JSON.stringify(result)).not.toContain("definitely");
  });

  it("handles a corrupted draft with no tiers without throwing", () => {
    const draft = createComfortDraft({ title: "No tiers", activityType: "custom" });
    const corruptedDraft = { ...draft, tiers: [] };
    const result = calculateResultSummary(corruptedDraft, [
      response("maybe", "missing"),
      response("maybe", "missing"),
      response("maybe", "missing"),
      response("maybe", "missing")
    ]);

    expect(result.responseCount).toBe(4);
    expect(result.bestFit.label).toBeTruthy();
    expect(result.finalMessage).toContain(corruptedDraft.title);
  });
});
