import { describe, expect, it } from "vitest";
import {
  calculateResultSummary,
  createComfortDraft,
  normalizeTitle,
  parsePrice,
  type ActivityType,
  type GuestResponse,
  type ResponseStatus
} from "../src";

const createdAt = "2026-06-20T08:00:00.000Z";

function response(status: ResponseStatus, tierId: string, constraintIds: string[] = []): GuestResponse {
  return { status, tierId, constraintIds, createdAt };
}

describe("adversarial hardening: crash safety", () => {
  it("falls back to custom for an unknown activity type instead of throwing", () => {
    expect(() => createComfortDraft({ title: "Mystery", activityType: "party" as unknown as ActivityType })).not.toThrow();
    const draft = createComfortDraft({ title: "Mystery", activityType: "rave" as unknown as ActivityType });
    expect(draft.activityType).toBe("custom");
    expect(draft.constraints.length).toBeGreaterThan(0);
    expect(draft.activityLabel).toBe("Custom");
  });

  it("ignores nullish response entries without throwing", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    const dirty = [null, undefined, response("in", "easy_yes")] as unknown as GuestResponse[];
    expect(() => calculateResultSummary(draft, dirty)).not.toThrow();
    expect(calculateResultSummary(draft, dirty).responseCount).toBe(1);
  });
});

describe("adversarial hardening: scoring correctness", () => {
  it("keeps a unanimous yes an easy yes even when a tier score is corrupted (NaN/Infinity)", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    for (const badScore of [NaN, Infinity, -Infinity, "3" as unknown as number]) {
      const corrupted = {
        ...draft,
        tiers: draft.tiers.map((tier) => (tier.id === "easy_yes" ? { ...tier, score: badScore } : tier))
      };
      const result = calculateResultSummary(corrupted, [
        response("in", "easy_yes"),
        response("in", "easy_yes"),
        response("in", "easy_yes"),
        response("in", "easy_yes"),
        response("in", "easy_yes")
      ]);
      expect(result.bestFit.label).toBe("Easy yes for the group");
    }
  });

  it("does not demote a unanimous yes when the referenced tier was removed after responses", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    // Host edited tier ids after guests responded; stored responses keep the old ids.
    const renamed = { ...draft, tiers: draft.tiers.map((tier) => ({ ...tier, id: `${tier.id}_v2` })) };
    const result = calculateResultSummary(renamed, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes")
    ]);
    expect(result.bestFit.label).toBe("Easy yes for the group");
  });

  it("calls a unanimous maybe workable, not mixed", () => {
    const draft = createComfortDraft({ title: "Park hang", activityType: "casual_hangout" });
    const result = calculateResultSummary(draft, [
      response("maybe", "works_with_tweaks"),
      response("maybe", "works_with_tweaks"),
      response("maybe", "works_with_tweaks"),
      response("maybe", "works_with_tweaks")
    ]);
    expect(result.bestFit.label).toBe("Works with a few tweaks");
    expect(result.comfortRange.label).toBe("Workable");
  });
});

describe("adversarial hardening: price parsing", () => {
  it.each<[string, string]>([
    ["$-5", "malformed"],
    ["-5 dollars", "malformed"],
    ["1e9", "ambiguous"],
    ["$1e3", "ambiguous"],
    ["50%", "ambiguous"],
    ["20% off", "ambiguous"],
    ["$1,00", "ambiguous"],
    ["$1,0000", "ambiguous"],
    ["$,000", "ambiguous"],
    ["$1.2.3", "malformed"]
  ])("classifies mistyped price %s as %s", (input, state) => {
    expect(parsePrice(input).state).toBe(state);
  });

  it("never returns a negative amount", () => {
    for (const input of ["$-5", "-100", "-5 each", "$-0.5"]) {
      const parsed = parsePrice(input);
      expect(parsed.amount === undefined || parsed.amount >= 0).toBe(true);
    }
  });

  it.each<[string, string]>([
    ["$0", "free"],
    ["$20", "low"],
    ["$20.01", "normal"],
    ["$75", "normal"],
    ["$75.01", "high"],
    ["$250", "high"],
    ["$250.01", "extreme"]
  ])("pins price boundary %s to %s", (input, state) => {
    expect(parsePrice(input).state).toBe(state);
  });
});

describe("adversarial hardening: text safety", () => {
  it.each([86, 87, 88, 89, 90, 91, 92, 93, 94])("never truncates a title to a lone surrogate at length %i", (n) => {
    const title = normalizeTitle("A".repeat(n) + "🎂");
    const last = title.charCodeAt(title.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  it("strips HTML-ish characters and links from the current idea used in share text", () => {
    const draft = createComfortDraft({
      title: "Dinner",
      activityType: "dinner_drinks",
      currentIdea: "$50 <script>alert(1)</script> https://evil.example"
    });
    expect(draft.shareText).not.toContain("<");
    expect(draft.shareText).not.toContain(">");
    expect(draft.currentIdea ?? "").not.toContain("<");
    expect(draft.currentIdea ?? "").not.toContain("evil.example");
  });
});

describe("adversarial hardening: verdict-aware final message", () => {
  const draft = createComfortDraft({ title: "Pizza Friday", activityType: "dinner_drinks" });

  it("closes an easy yes by locking it in, not a generic sign-off", () => {
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes")
    ]);
    expect(result.finalMessage).toContain("Locking it in");
    expect(result.finalMessage).not.toContain("keeps this easy for the group");
  });

  it("closes a rethink by offering a lighter option, never implying it continues", () => {
    const result = calculateResultSummary(draft, [
      response("out", "not_comfortable"),
      response("out", "not_comfortable"),
      response("out", "not_comfortable"),
      response("in", "easy_yes")
    ]);
    expect(result.bestFit.label).toBe("Rethink the plan");
    expect(result.finalMessage).toContain("lighter option");
    expect(result.finalMessage).not.toContain("keeps this easy for the group");
  });
});

describe("adversarial hardening: generated copy consistency", () => {
  it("uses the correct article for a vowel-initial vibe in share text", () => {
    const draft = createComfortDraft({ title: "Trip", activityType: "group_trip", vibe: "adventurous" });
    expect(draft.shareText).toContain("Going for an adventurous vibe");
    expect(draft.shareText).not.toContain("a adventurous");
  });

  it("does not surface auto-injected preference constraints as flagged concerns", () => {
    // A vibe constraint selected by the whole group is a preference, not a blocker.
    const draft = createComfortDraft({ title: "Trip", activityType: "group_trip", vibe: "adventurous" });
    const vibeId = draft.constraints.find((c) => c.id.startsWith("vibe-"))!.id;
    const result = calculateResultSummary(draft, [
      response("maybe", "works_with_tweaks", [vibeId]),
      response("maybe", "works_with_tweaks", [vibeId]),
      response("maybe", "works_with_tweaks", [vibeId]),
      response("maybe", "works_with_tweaks", [vibeId])
    ]);
    expect(result.finalMessage).not.toContain("mattered to most people");
    expect(result.publicSnapshot.safeStats.join(" ")).not.toContain("adventurous vibe");
  });

  it("does not crash on corrupted non-iterable or null constraint data", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks" });
    const corrupted = [
      { status: "in", tierId: "easy_yes", constraintIds: 123 as unknown as string[], createdAt },
      { status: "in", tierId: "easy_yes", constraintIds: undefined as unknown as string[], createdAt },
      response("in", "easy_yes"),
      response("maybe", "works_with_tweaks")
    ];
    expect(() => calculateResultSummary(draft, corrupted)).not.toThrow();
    expect(() => calculateResultSummary({ ...draft, constraints: null as unknown as typeof draft.constraints }, [
      response("in", "easy_yes", ["budget-friendly"]),
      response("in", "easy_yes", ["budget-friendly"]),
      response("in", "easy_yes", ["budget-friendly"]),
      response("in", "easy_yes", ["budget-friendly"])
    ])).not.toThrow();
  });

  it("does not warn about a high price when the group is unanimously comfortable", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks", currentIdea: "$300 per person" });
    expect(draft.price.state).toBe("extreme");
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes"),
      response("in", "easy_yes")
    ]);
    expect(result.bestFit.label).toBe("Easy yes for the group");
    expect(result.currentIdeaWarning).toBeUndefined();
  });

  it("still warns about a high price when there is real friction", () => {
    const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks", currentIdea: "$300 per person" });
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes"),
      response("maybe", "works_with_tweaks"),
      response("out", "not_comfortable"),
      response("maybe", "works_with_tweaks")
    ]);
    expect(result.currentIdeaWarning).toMatch(/pressure point|cheaper/i);
  });

  it("treats a multi-number / range price string as ambiguous", () => {
    for (const input of ["$10 and $300", "between $20 and $40", "$100 to $200"]) {
      expect(parsePrice(input).state).toBe("ambiguous");
    }
  });
});

describe("adversarial hardening: corrupted-input robustness", () => {
  const draft = createComfortDraft({ title: "Dinner", activityType: "dinner_drinks", currentIdea: "$300 per person" });
  const four = [
    response("in", "easy_yes"),
    response("in", "easy_yes"),
    response("in", "easy_yes"),
    response("maybe", "works_with_tweaks")
  ];

  it("does not throw on a non-array responses value", () => {
    for (const bad of [42, "abc", {}, null, undefined]) {
      expect(() => calculateResultSummary(draft, bad as unknown as typeof four)).not.toThrow();
    }
  });

  it("does not throw when the draft price is missing", () => {
    const noPrice = { ...draft, price: null as unknown as typeof draft.price };
    expect(() => calculateResultSummary(noPrice, four)).not.toThrow();
  });

  it("strips control characters from titles and current idea", () => {
    const built = createComfortDraft({
      title: "alarmbell ",
      activityType: "dinner_drinks",
      currentIdea: "go $40 here"
    });
    expect(built.title).toBe("alarmbell");
    expect(built.currentIdea ?? "").not.toMatch(/[ -]/);
    expect(built.shareText).not.toMatch(/[ -]/);
  });

  it("quotes host-authored custom constraint labels instead of splicing them into a sentence", () => {
    const customDraft = createComfortDraft(
      { title: "Trip", activityType: "group_trip", customConstraints: ["I cannot do Saturdays"] },
      "premium"
    );
    const customId = customDraft.constraints.find((c) => c.group === "custom")!.id;
    const result = calculateResultSummary(customDraft, [
      response("maybe", "works_with_tweaks", [customId]),
      response("maybe", "works_with_tweaks", [customId]),
      response("out", "not_comfortable", [customId]),
      response("maybe", "works_with_tweaks", [customId])
    ]);
    expect(result.finalMessage).toContain('Several people flagged "I cannot do Saturdays".');
    expect(result.finalMessage).not.toContain("I cannot do Saturdays mattered to most people");
  });
});

describe("adversarial hardening: constraint privacy boundary", () => {
  const draft = createComfortDraft({ title: "Group dinner", activityType: "dinner_drinks" });
  const budgetId = draft.constraints.find((constraint) => constraint.group === "budget")!.id;

  it("surfaces a constraint selected by exactly the privacy threshold", () => {
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", [budgetId])
    ]);
    expect(result.groupedConstraints.some((constraint) => constraint.id === budgetId)).toBe(true);
  });

  it("suppresses a constraint selected by fewer than the threshold even when results unlock", () => {
    const result = calculateResultSummary(draft, [
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", [budgetId]),
      response("in", "easy_yes", []),
      response("maybe", "works_with_tweaks", [])
    ]);
    expect(result.isPrivacySuppressed).toBe(false);
    expect(result.groupedConstraints.some((constraint) => constraint.id === budgetId)).toBe(false);
  });
});
