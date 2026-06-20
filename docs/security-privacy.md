# Security And Privacy

## Token model

- Host, result, and response tokens are long random values and stored hashed at rest.
- Guest share tokens are long random public slugs for opening the guest page. The lookup hash is stored, and host re-share material is stored encrypted with a server-only `SAYABLE_TOKEN_ENCRYPTION_KEY`.
- Sequential IDs are not exposed as authorization.
- Response edit/delete requires the response token.
- Host results require the host token.
- Public snapshots require a result token created by the final-share action.
- Local Google-demo save/dashboard/premium actions require `SAYABLE_DEMO_AUTH_ENABLED=true` plus a signed demo session token. Production should leave demo auth disabled and uses Supabase Auth bearer/session verification for dashboard, claim, upgrade, and account deletion routes.
- `SAYABLE_DEMO_AUTH_SECRET` should be set when local demo auth is enabled. If demo auth is enabled while `NODE_ENV=production`, the server hard-fails any demo session unless the secret is set (no silent per-process fallback). `SAYABLE_TOKEN_ENCRYPTION_KEY` is required for Supabase mode; local file mode creates an ignored stable key next to the file store if one is not provided.

## Privacy model

- Guests never need accounts.
- Host first share never needs login.
- Host results hide detailed aggregates below 4 active responses.
- Individual constraint patterns only surface when at least 4 active private responses selected the same constraint, and surfaced constraint signals are qualitative rather than exact counts or percentages.
- Public snapshots never include private notes or named budget answers.
- Public snapshots are revoked when underlying responses or whole-check deletion can make the aggregate stale or privacy-suppressed.
- Deleted responses are ignored by aggregation.
- Deleted responses remove private notes and constraints from the active store path.
- React rendering escapes stored text; API validation enforces field lengths and known enum values.

## RLS

`supabase/migrations/0001_sayable_mvp.sql` enables RLS on all MVP tables. Anonymous clients receive no direct table policies. Authenticated hosts can read owned checks and manage owned support tables, but direct `comfort_checks` updates are not granted. Plan, status, token, draft, theme, purchase, response, analytics, audit, and abuse mutations stay server/admin mediated.

`supabase/migrations/0004_advisor_hardening.sql` clears all `supabase db advisors` findings: it pins a non-mutable empty `search_path` on the trigger/lock helper functions and rewrites the owner-scoped `SELECT` policies to evaluate `(select auth.uid())` once per statement instead of per row. `supabase db lint` and both advisor categories report zero findings after migration.

Verified locally: with RLS enabled and a seeded private row present, an anonymous publishable-key client reads `[]` from every private table and is rejected (401) on inserts and lock RPCs; two distinct authenticated users cannot read or update each other's `comfort_checks` rows.

When `SAYABLE_STORE_BACKEND=supabase`, server API routes persist the MVP runtime state in normalized RLS-enabled Postgres tables rather than a single JSON document. A server-only RPC lock serializes the MVP whole-store write path across app instances. Local smoke defaults to the file backend so tests do not require secrets; set `SAYABLE_STORE_BACKEND=supabase` to run the smoke against a Supabase project.

## Abuse controls

API routes use per-route in-memory rate limits for local MVP smoke and log abuse events with hashed IP/source fingerprints. Proxy headers are trusted only when `SAYABLE_TRUST_PROXY_HEADERS=true`; `User-Agent` is not part of the limiter key, so rotating it does not create a fresh bucket. Duplicate-response UX uses a browser-local nonce hash, not the IP fingerprint, so unrelated guests on the same network can still answer. The anonymous create-cap is best-effort (keyed on the source fingerprint or a client nonce); the durable abuse control is the rate limit. Production must run behind a trusted proxy with `SAYABLE_TRUST_PROXY_HEADERS=true` and replace the in-memory limiter with a durable IP/device/session limiter at the edge or in Postgres.

Local MVP store mutations are serialized in-process so rapid same-instance submits cannot overwrite accepted responses. Supabase mode also takes a Postgres-backed runtime lock around the whole-store mutation path. The append-only `analytics_events`, `audit_logs`, and `abuse_events` tables are capped (5000/5000/2000 most-recent rows) on every write so the whole-store document stays bounded and cannot be grown without bound by a logging flood. Production should still move hot paths to row-level transactional inserts/updates for better scale and simpler failure recovery.

Premium checkout has two modes. `STRIPE_MODE=test` is the real production path (Stripe Checkout + signed webhook). `STRIPE_MODE=mock` grants Premium without payment for local/demo use and is refused when `NODE_ENV=production` unless `SAYABLE_ALLOW_MOCK_BILLING=true` is explicitly set, so a production deploy that forgets to configure Stripe cannot silently hand out paid features.

Sensitive local-store actions audit log check creation, response submit/delete, check claim, Premium mock/test checkout outcomes, and admin close/delete actions. Stripe test-mode Checkout URLs do not include host bearer tokens; webhook completion is tied back through Stripe session metadata and a signed-host return check.

## Secrets

`.env.local` and all local env variants are gitignored. Supabase publishable keys are allowed in client env. Service-role keys and Stripe secrets must stay server-only.
