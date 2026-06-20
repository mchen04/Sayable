# Testing And Verification

## Commands

```bash
npm run typecheck
npm run lint
npm run guard:no-llm
npm run test
npm run test:mutations
npm run smoke:web
npm run build
npm audit --audit-level=high
npm run verify
```

Core logic tests live in `packages/core/test/core.test.ts` and cover:

- golden draft generation for every day-one activity type
- weird title and price parsing cases
- small-group privacy suppression
- deleted response aggregation
- free/premium limits
- required starter themes
- deterministic scenario matrix across activity, price state, guest count, and response mix
- activity-specific premium theme defaults

Additional deterministic stress coverage lives in `packages/core/test/stress.test.ts` with oracle fixtures in `packages/core/test/fixtures/core-oracles.json`. It covers:

- independent all-activity oracle fixture expectations for draft/result behavior
- seeded deterministic simulations across activity, vibe, price state, plan, response mix, and guest count
- explicit axis coverage across activity, vibe, price state, guest count, response mix, tier state, custom constraint state, and free/premium plan
- full generated cross-product matrix across activity type x vibe state x price state x guest count x response mix x free/premium plan
- free/premium custom constraint boundary behavior
- load-like pure-logic batches
- metamorphic checks for irrelevant title punctuation
- deterministic snapshot hashes for canonical draft/result outputs
- mutation sentinels for privacy threshold, per-constraint privacy, easy-yes scoring, and free/premium limit breaks
- runtime-invalid vibe fallback
- corrupted runtime response and corrupted no-tier draft handling
- weird price formats such as `$1,200`, `$12,000`, and `1.2k`

`npm run test:mutations` copies `packages/core` into temporary workspaces, applies targeted source mutations, and proves the test suite catches each one. Current mutations cover:

- lowering the privacy threshold from 4 to 3
- lowering the per-constraint privacy threshold from 4 to 1
- allowing `maybe` responses into an "Easy yes" result
- including deleted responses in result summaries
- raising the free response cap
- lowering the premium response cap
- raising/lowering custom constraint caps
- ignoring `k` price notation
- weakening title angle-bracket sanitization
- failing to mark response deletion
- failing to revoke old public snapshots after response deletion
- leaking private notes into public snapshots
- allowing final share while privacy-suppressed
- removing deleted-check terminal-state protection

Web/API mutations run from an isolated temporary repo copy with `node_modules` symlinked back to the local install. The mutation runner does not patch the live working tree.

## Browser smoke checklist

Run with the web server at `http://localhost:3000`.

1. Landing page loads and first viewport includes the Comfort Check creator.
2. Create each day-one activity type.
3. Review generated questions, tiers, constraints, privacy copy, and share text.
4. Edit/delete/reset generated constraints.
5. Copy/share guest link.
6. Guest opens link without login.
7. Guest submits, edits, and deletes a response.
8. Host results show privacy suppression under 4 responses and grouped constraints at 4+ responses.
9. Final share creates a public-safe snapshot.
10. Continue with Google demo claim saves the check to dashboard.
11. Premium mock success unlocks premium limits and themes.
12. Premium mock failed/cancelled states do not unlock.
13. Privacy, terms, support, deletion, admin pages are reachable.
14. Required viewports: 360x740, 390x844, 844x390, 768x1024, 1024x768, 1024x700, 1440x900.

## Automated web smoke

`npm run smoke:web` starts the Next.js app on an isolated local port with a temporary store file, then checks:

- all seven day-one activity types can create checks
- guest link opens with privacy copy
- invalid guest tokens and malformed response payloads fail safely
- guest submit, edit, delete, and duplicate delete behavior
- browser-nonce duplicate rejection without blocking same-source different-nonce guests
- 12 parallel accepted guest submissions persist as 12 host-visible responses
- host results hide private notes and token hashes
- aggregate results appear at the 4-response privacy threshold while individual constraints surface only as qualitative 4-selection patterns
- final share rejects zero-response and 3-response privacy-suppressed states
- public-safe snapshot opens without private notes
- response deletion revokes previously generated public result snapshots
- signed demo Google claim and dashboard ownership
- Premium Check mock rejects unclaimed/wrong-owner attempts, then unlocks for the signed owner
- Premium Check mock rejects terminal closed-check upgrades
- Premium upgrade preserves host-edited prompts and custom constraints
- premium activity theme default, premium theme override, and custom theme persistence
- admin route requires `x-sayable-admin-token`
- admin invalid actions are rejected instead of defaulting to delete
- admin malformed JSON is rejected as a bad request
- free 30-response cap rejects the 31st simulated guest
- premium 100-response cap rejects the 101st simulated guest
- signed owners cannot bypass the 3 active free-check cap by creating/claiming repeatedly
- edited responses update aggregates and deleted responses re-suppress below the privacy threshold
- deleted constraints are removed from aggregate output instead of appearing as `Other constraint`
- response update output is sanitized and does not expose internal ids, token hashes, or browser nonce hashes
- audit logs cover check claim, Premium mock completion, response deletion, and host close
- generated question/tier edits and draft reset persist
- closed/deleted/expired check failure states reject unsafe actions
- whole-check deletion anonymizes associated private response notes and constraints

`npm run verify` includes the no-LLM guard, core mutation smoke, and this web smoke script before the production build.

`npm audit --audit-level=high` passes on the current Next 16 / Expo 56 / React 19 stack. `npm audit` still reports moderate/low transitive advisories in current framework chains, tracked in `validation/adversarial-loops.md`.

## Final validation gates

The implementation contract requires independent-context adversarial convergence loops and `/criticality-loop` convergence 2 before the goal can be marked complete. Those gates are recorded as converged in `validation/adversarial-loops.md`; `/criticality-loop` convergence is recorded in `criticality-loop.log.md`.
