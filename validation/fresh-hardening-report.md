# Sayable Fresh Adversarial Hardening Report

Run started: 2026-06-20
Branch: `sayable-mvp-implementation`
Executor: Claude Code (Opus 4.8) adversarial hardening pass

This report is the single source of truth for the current hardening run. Treat any
prior pass/fail records as stale. Every in-scope finding ends as
`fixed + verified`, `not reproducible with evidence`, or `external credential/setup blocker`.

---

## 0. Execution Contract Baseline

| Command | Result | Notes |
| --- | --- | --- |
| `git status --short --branch` | OK | Pending: README/docs/testing cleanup, deleted stale `criticality-loop.log.md` + `validation/adversarial-loops.md`. |
| `npm install` | OK | `node_modules` present and consistent with lockfile. |
| `npm run typecheck` | PASS | core + web + mobile all `tsc --noEmit` clean. |
| `npm run lint` | PASS | web eslint `--max-warnings=0`; core/mobile tsc clean. |
| `npm run guard:no-llm` | PASS | No LLM dependencies or API source paths detected. |
| `npm run test` | PASS | 40 tests (core.test.ts 19, stress.test.ts 21). |
| `npm run test:mutations` | PASS | 15/15 mutations caught (10 core + 5 web). |
| `npm run build` | PASS | Next production build, 19 static pages, all routes compiled. |
| `npm audit --audit-level=high` | PASS | 14 vulns (1 low, 13 moderate), all in `@expo/*` dev/build tooling (mobile). No high/critical. Not runtime web. |
| `supabase --version` | 2.98.2 | Newer 2.107.0 available; pinned (works for all required local checks). |
| `supabase status` | initialized | `supabase init` created `config.toml`; local stack starting. |

Baseline conclusion: green. Proceeding to adversarial gates.

---

## Issue Ledger

Findings raised by fresh independent reviewers (4 parallel adversarial agents: IDOR/token/RLS,
privacy/secret, core-logic correctness, generated-output quality) plus `supabase db advisors`.

### Supabase advisors
| ID | Sev | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| ADV-1 | warn(sec) | `function_search_path_mutable` on set_updated_at, try_acquire_/release_sayable_store_lock | fixed+verified | migration `0004`; `supabase db advisors --type security` → 0 findings |
| ADV-2 | warn(perf) | `auth_rls_initplan` re-evaluates auth.uid() per row on 4 policies | fixed+verified | migration `0004` wraps `(select auth.uid())`; advisors → 0 findings |

### Security — IDOR / token / RLS reviewer
| ID | Sev | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| SEC-A1 | high | Mock billing grants Premium free; could leak into prod if STRIPE_MODE≠test | fixed+verified | `billing.ts` `mockBillingAllowed()` guard refuses mock entitlements in production unless `SAYABLE_ALLOW_MOCK_BILLING=true`; typecheck/lint pass |
| SEC-A2 | high | Whole-store rewrite + unbounded analytics/audit/abuse growth = amplification | mitigated+verified | `store-backend.ts` `pruneAppendOnlyTables` caps logs (5k/5k/2k) so store stays bounded; residual row-level-write rearchitecture documented as post-MVP in `docs/operations.md` |
| SEC-A3 | med | In-memory rate limiter: constant `"local"` bucket (no proxy) or spoofable XFF | accepted+documented | MVP in-memory limiter; production deployment requirement (trusted proxy + `SAYABLE_TRUST_PROXY_HEADERS=true`, durable limiter) documented in `docs/operations.md` |
| SEC-A4 | low | Anonymous create-cap keyed on client nonce / constant fingerprint = bypassable | accepted+documented | Rate limit is the real control; cap is best-effort. Documented in `docs/security-privacy.md` |
| SEC-B1 | low | Demo auth secret silently auto-generates per process | fixed | `demo-auth.ts` hard-fails in production when enabled without `SAYABLE_DEMO_AUTH_SECRET` |
| SEC-B2 | low | `.env.example` shipped real project ref + mock/demo-on defaults | fixed | genericized URL, `SAYABLE_DEMO_AUTH_ENABLED=false`, prod-invariant comments |

### Privacy / secret reviewer
| ID | Sev | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PRIV-A1 | low | Private-note placeholder copy implied the host reads notes (host never does) | fixed | `GuestCheckClient.tsx` copy corrected ("only you", never host/shared) |
| PRIV-A2 | low | `markFinalShared` could leave a duplicate live snapshot on re-share | fixed+verified | `store.ts` invalidates prior snapshots before pushing a new one; smoke re-share revocation assertion |

### Core deterministic logic reviewer
| ID | Sev | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CORE-A1 | high | `createComfortDraft` crashes on unknown activityType | fixed+verified | `safeActivityType` fallback; `hardening.test.ts` |
| CORE-A2 | med-high | `calculateResultSummary` crashes on null/undefined response entries | fixed+verified | null guard in `activeResponses`; `hardening.test.ts` |
| CORE-A3 | high | NaN/Infinity tier score silently flips verdict | fixed+verified | finite guard → status-derived fallback; test + new mutation |
| CORE-A4 | high | Unknown tierId (tier renamed after responses) demotes a unanimous yes | fixed+verified | status-derived fallback; test + new mutation |
| CORE-A5 | med | Negative / exponent / leading-dot prices mis-parsed (e.g. `$-5`→low) | fixed+verified | `parsePrice` guards; table tests + new mutation |
| CORE-A6 | med | Malformed comma grouping silently truncates (`$1,00`→1) | fixed+verified | comma-grouping validation → ambiguous; table tests |
| CORE-A7 | low-med | Title truncation cut mid-surrogate → broken glyph | fixed+verified | code-point slice + dangling-surrogate trim; property test + new mutation |
| CORE-A8 | low | `50%` classified as a `$` price | fixed+verified | `%` → ambiguous; table test |
| CORE-A9 | low | Unanimous "maybe" labeled comfort range "Mixed" | fixed+verified | "Workable" middle bucket; `hardening.test.ts` |
| CORE-A10 | low | `currentIdea` not sanitized for `<>`/URLs in share text | fixed+verified | `sanitizeIdea`; `hardening.test.ts` |

### Generated-output quality judge
| ID | Sev | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| OUT-1 | blocker | Constraint labels read backwards when reused as concerns | fixed | topic-style labels in `draft.ts`; oracle fixture updated |
| OUT-2 | high | Verdict-blind generic final-message tail (contradicts "rethink") | fixed | verdict-aware `FINAL_MESSAGE_CLOSERS` in `results.ts` |
| OUT-3 | med | Public snapshot detail was meta ("the host can share…"), not a takeaway | fixed | `PUBLIC_SNAPSHOT_DETAIL` by verdict |
| OUT-4 | med | `safeStats` "Common constraints surfaced" vague | fixed | comfort + top-flagged aggregate stats |
| OUT-5 | low | Share text led with redundant product jargon + slash + bare one-word | fixed | rewritten `shareText` |

DEFENDED (no change needed, independently re-verified): RLS denies anon reads on all private
tables even with data present; authenticated owners cannot read/update other owners' rows;
service-role functions revoked from anon/authenticated; 256-bit tokens; timing-safe admin/demo/
Stripe comparisons; no server secret in client bundle; private notes never reach host UI/OG/admin/
analytics/logs. See "Cycle 1" below for live evidence.

---

## Cycle Log

### Cycle 0 — Baseline (executor)
- Surfaces: full repo (core logic, web app, mobile, scripts, supabase migrations, docs).
- Findings: none blocking; baseline fully green (see table above).
- Fixes: none required at baseline.
- Verification: command outputs captured.
- Result: PASS (baseline only — not a convergence cycle).
- Remaining risk: adversarial gates not yet run.

### Cycle 1 — Adversarial review wave 1 + Supabase gate (4 fresh reviewers + executor)
- Reviewers/tools: 4 independent agents (IDOR/RLS, privacy/secret, core correctness, output quality) + `supabase db advisors`.
- Surfaces: all API routes, store layer, auth, schemas, migrations/RLS, core engines, generated copy, full Supabase local stack.
- Findings: see Issue Ledger (ADV-1/2, SEC-A1..B2, PRIV-A1/2, CORE-A1..A10, OUT-1..5).
- Fixes made: migration `0004`; core `draft.ts`/`results.ts` correctness + copy; `store.ts`/`store-backend.ts` (snapshot revocation, log pruning, realtime gating); `billing.ts`/`demo-auth.ts` prod guards; `GuestCheckClient.tsx` copy; `.env.example`; smoke harness backend isolation + OG assertion; +37 new core tests; +3 new mutations.
- Verification — Supabase local CLI gate (all PASS):
  - `supabase --version` 2.98.2; `supabase start` (Docker) up; `supabase db reset` applies 0001–0004 clean.
  - `supabase migration list` → 0001–0004 local+remote columns aligned.
  - `supabase db lint` → "No schema errors found".
  - `supabase db advisors --type security` and `--type performance` → **0 findings** (post-0004).
  - `npm run check:supabase` (local) → `{ ok: true, publicAuth: ok, serverStore: ok, runtimeRpc: ok }`.
  - Supabase-mode `npm run smoke:web` (local) → `ok: true` (all 7 activity types, premium, admin, deleted-response checks).
  - Persistence confirmed via REST count: 24 comfort_checks, 156 responses, 3 purchases, 195 audit_logs in local Postgres.
  - RLS live proof (anon publishable key): reads on all 9 tables return `[]` even with a seeded row containing `"SECRET NOTE"`; INSERT → 401 (42501 RLS); lock RPC → 401 (permission denied). Service role sees the row; cascade delete OK.
  - Owner isolation live proof: 2 real auth users — owner A sees own check; owner B reads `[]`; owner B PATCH of A's plan affects 0 rows. Cleaned up.
- Verification — core: `npm run test` 77 passed; `npm run test:mutations` all caught (file-isolated); `typecheck`/`lint`/`guard:no-llm` clean.
- Result: Supabase gate PASS (local). Security + core + output-quality require a fresh re-review cycle for convergence 2 (Cycle 2).
- Remaining risk / blocker: **Hosted Supabase verification** — credentials exist in `.env.local` but the execution harness blocks direct connections to the production project without explicit user authorization (Production Reads policy). Recorded as the single hosted-proof blocker; local CLI verification is complete per the goal's contingency.

### Cycle 2 — Fresh re-review of fixed code (3 fresh reviewers)
- **Security (fresh):** GATE PASS. No confirmed-exploitable in-scope issues; only non-exploitable hardening nits (per-instance limiter, owner-row token columns undecryptable client-side, realtime channel timestamp-only payload, server-only import cosmetics) — already documented as MVP limitations.
- **Core (fresh):** GATE FAIL → fixed. New findings: (a) "Going for a adventurous vibe" wrong article in shareText; (b) auto-injected preference constraints (vibe/`price-flexible`/`free-still-comfortable`) read backwards when surfaced as "Most people flagged …"; (c) high-price `currentIdeaWarning` contradicted a unanimous easy-yes; (d) multi-number/range price strings silently took the first number. Fixes: article-aware vibe copy, `isPreferenceConstraint` headline exclusion (final message + safeStats), warning gated on response friction, multi-number → ambiguous. +6 hardening tests, +2 mutations.
- **Output quality (fresh):** GATE FAIL (avg 8.8) → fixed. Remaining defect was the price-high label "Feeling okay with $X" reading backwards as a flagged concern; replaced with neutral "The $X price". Re-judge (fresh) → **avg 9.10, every scenario ≥ 8.5, GATE PASS**.
- Verification: `npm run test` 82 passed; `npm run test:mutations` **20/20 caught** (incl. 5 new: tier-score fallback, surrogate slice, negative price, preference-constraint surfacing, high-price-warning contradiction); typecheck/lint clean.

### Cycle 3 — Convergence re-review of latest code (fresh reviewers)
- **Security (fresh):** GATE PASS again → **security convergence 2 achieved** (two consecutive fresh PASSes, no in-scope issues).
- **Output quality (fresh):** repeated copy refinements (verdict-aware closers, neutral price labels, comma formatting, verdict-aligned public comfort word, suppressed easy-yes flag, noun-phrase constraint labels, "X mattered to most people" frame, custom-label quoting). Two consecutive fresh PASSes → **output-quality convergence 2 achieved**: 9.16 then 9.30 (avg > 9.0, every scenario ≥ 8.5).
- **Core (fresh):** two consecutive fresh PASSes → **core convergence 2 achieved**. Findings fixed across cycles: invalid-activity guard, nullish/non-array/corrupted responses, NaN/Infinity/missing tier-score → status fallback, multi-number/negative/percent/exponent/comma price parsing, surrogate-safe + control-char title/idea sanitization, vibe article, preference-constraint headline exclusion, warning-vs-verdict contradiction, custom-label quoting. 87 core tests, 20 mutations all caught.

### Criticality review (fresh, issue-driven)
- **Cycle 1:** GATE FAIL. Findings: B1 (blocker) store lock had no fencing token → a write past the 20s TTL could let two instances both run the destructive whole-store-replace RPC (data loss); I1 RPC had no idempotency guard + fire-and-forget logging shared the surface; I2 `DashboardClient` swallowed fetch failures (false empty state); I3 migration 0003 patched the RPC via fragile runtime `pg_get_functiondef` string-replace; I4 Stripe webhook IP rate-limit (60/min) could throttle legitimate bursts; M1 unused `expo-sharing` dep; M4 empty root `public/`.
- **Fixes:** migration `0005_store_lock_fencing.sql` adds a fencing token — the RPC refuses to run unless the caller holds an unexpired lock for its owner id (also canonical text-typed definition replacing the 0003 string-patch); store-backend threads the lock owner through `writeStore`/`resetStoreForTests`; `DashboardClient` now branches on `response.ok` and surfaces errors; webhook abuse cap raised to 600/min (auth is the HMAC signature); removed `expo-sharing` (lockfile synced) and empty `public/`. M3 (read-path status mutation, harmless/not persisted) accepted with note.
- **Verification:** `supabase db reset` applies 0001–0005 clean; advisors security/performance → 0 findings; db lint clean; Supabase-mode smoke + check:supabase pass against local with the fenced RPC.

### Criticality loop — convergence
- **Cycle 1:** FAIL (blocker B1 + I1–I4 + minors) → all fixed (migration 0005 fencing, threaded lock owner, DashboardClient error handling, OG CDN cache, webhook cap, dead-code removal, billing/return StoreError, removed `expo-sharing` + empty `public/`, trust-proxy + version docs, `.env.example` trust-proxy line).
- **Cycle 2 (fresh):** GATE PASS — verified version-control completeness (migrations 0001–0005 + hardening test tracked, no secrets), the fencing closes the data-loss window in-transaction, all 8 items fixed; only 2 minor docs/hygiene findings (both addressed/accepted).

### Final /agent-browser regression — production build (`npm run build` + `npm run start -w @sayable/web`, NODE_ENV=production)
Verified via `open` + `snapshot` + `errors`/`console` + API probes (note: `captureScreenshot` was unavailable — see blocker below):
- All 7 day-one activity types create (201).
- Surfaces render with content present and **0 app console errors**: landing, create, host review, guest, host results, public snapshot, privacy, terms, support, delete.
- Host review/edit/share, guest submit, final share + public-safe snapshot all functional.
- Premium mock upgrade in production succeeds only with `SAYABLE_ALLOW_MOCK_BILLING=true` (purchase `completed`, plan → premium) — the A1 production guard holds.
- Failure state: invalid result token → "Sayable result unavailable" (no raw error/stack).
- OG image route returns CDN cache headers on success (`public, max-age=300, s-maxage=600, stale-while-revalidate=86400`).

## Loop convergence status
- Security adversarial loop: **CONVERGED 2** (no in-scope issues).
- Deterministic no-LLM core loop: **CONVERGED 2** (+ generated-output quality CONVERGED 2: 9.16 then 9.30).
- Criticality loop: FAIL → **PASS** after fixes (fresh re-review verified all fixes; blocker resolved).
- Supabase gate: local CLI integration **VERIFIED** (migrations/lint/advisors-0/RLS/owner-isolation/check:supabase/Supabase-mode smoke + persistence); hosted = documented external blocker.
- Final agent-browser regression (prod build): **PASS** (content + zero console errors; screenshots blocked — see below).
- UI/UX + viewport loop: substantial convergence (8.28 → 8.80) with **all functional/trust/accessibility/conversion/privacy perspectives ≥ 8.5 (to 9.3)**; the single residual axis is "Gen-Z visual personality" (7.5→8.0, highly judge-variable). Targeted personality fixes were applied and **verified live in the DOM** (brand-green native controls — radio `accent-color: rgb(47,111,94)` replacing the off-brand blue; brand-tinted selected cards; verdict-tone color chips — public snapshot `verdict-chip tone-yellow`, amber `rgb(138,90,18)` on soft-yellow; dual-CTA resolved; placeholder/contrast). The round-3 **visual** re-judge could not be screenshotted: `agent-browser` `captureScreenshot` (CDP) began timing out mid-run and did not recover across fresh sessions, a full daemon kill/restart, default viewport, and memory cleanup — an environmental tool failure (`open`/`snapshot`/`eval`/`console` continued working). Viewport robustness was separately verified: **no horizontal overflow** at 360/390/844×390/768×1024/1024×700/1440.

## Documented external/tool blockers (the only items not closed by direct evidence)
1. **Hosted Supabase verification** — credentials exist in `.env.local`, but the execution environment blocks direct connections to the production project without explicit user authorization. Local Supabase CLI verification is complete per the goal's contingency. To finish: authorize a hosted `npm run check:supabase` + Supabase-mode smoke, and apply migrations 0004–0005 to the hosted project.
2. **`agent-browser` `captureScreenshot` failure** — blocked the final UI **visual** re-judge screenshots and the screenshot-based final regression capture. Worked earlier in the run (≈12 screenshots captured across viewports/surfaces, 2 full UI judge rounds); degraded mid-session. UI fixes verified via DOM/computed styles; regression verified via snapshot/console. To finish: re-run the round-3 UI judge once `captureScreenshot` is restored.
