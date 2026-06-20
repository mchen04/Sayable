# Deterministic Core Logic

Sayable does not use LLMs for MVP drafting, scoring, ranking, aggregation, recommendations, summaries, or share text.

`packages/core/src/draft.ts` generates:

- normalized title
- activity label
- price state
- guest questions
- comfort tiers
- default and price/vibe constraints
- privacy copy
- group-chat share text
- final-share prompt

`packages/core/src/results.ts` calculates:

- active response count (nullish/corrupted entries are skipped, not crashed on)
- privacy suppression below 4 responses
- best fit (a tier score that is missing/NaN/Infinity falls back to the response status, so a corrupted or post-edited tier never flips a unanimous verdict)
- comfort range (Comfortable / Workable / Uncomfortable / Mixed — a tight middle band is "Workable", not a false "Mixed")
- current idea warning
- grouped constraints
- final host message (verdict-aware closing line; references the top flagged constraint as a neutral topic phrase, never an affirmation read backwards)
- public-safe snapshot payload (plain-language takeaway keyed to the verdict)

`packages/core/src/limits.ts` enforces:

- free: 30 responses, 2 custom constraints, 30-day retention
- premium: 100 responses, 10 custom constraints, 180-day retention

`npm run guard:no-llm` fails verification if common LLM SDK dependencies or model API source paths are introduced.

`packages/core/src/themes.ts` defines the required starter themes and premium gating.

## Stress Artifacts

- `packages/core/test/fixtures/core-oracles.json` stores expected outcomes outside implementation code.
- `packages/core/test/stress.test.ts` runs oracle, seeded simulation, load-like batch, metamorphic, deterministic snapshot, mutation sentinel, runtime invalid-input, and weird-price coverage.
- `packages/core/test/hardening.test.ts` adds adversarial crash-safety, scoring-integrity, price-parsing, surrogate-safe text, verdict-aware messaging, and privacy-boundary coverage.
- The seeded simulation records failing seeds by failing the test with the seed list.
