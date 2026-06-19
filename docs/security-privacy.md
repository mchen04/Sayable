# Security And Privacy

## Token model

- Host, result, and response tokens are long random values and stored hashed at rest.
- Guest share tokens are long random public slugs for opening the guest page. The lookup hash is stored, and host re-share material is stored encrypted with a server-only `SAYABLE_TOKEN_ENCRYPTION_KEY`.
- Sequential IDs are not exposed as authorization.
- Response edit/delete requires the response token.
- Host results require the host token.
- Public snapshots require a result token created by the final-share action.
- Local Google-demo save/dashboard/premium actions require `SAYABLE_DEMO_AUTH_ENABLED=true` plus a signed demo session token. Production should leave demo auth disabled and use Supabase Auth session verification.
- `SAYABLE_DEMO_AUTH_SECRET` should be set when local demo auth is enabled. `SAYABLE_TOKEN_ENCRYPTION_KEY` is required for Supabase mode; local file mode creates an ignored stable key next to the file store if one is not provided.

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

When `SAYABLE_STORE_BACKEND=supabase`, server API routes persist the MVP runtime state in normalized RLS-enabled Postgres tables rather than a single JSON document. A server-only RPC lock serializes the MVP whole-store write path across app instances. Local smoke uses the file backend so tests do not require secrets.

## Abuse controls

API routes use per-route in-memory rate limits for local MVP smoke and log abuse events with hashed IP/source fingerprints. Proxy headers are trusted only when `SAYABLE_TRUST_PROXY_HEADERS=true`; `User-Agent` is not part of the limiter key, so rotating it does not create a fresh bucket. Duplicate-response UX uses a browser-local nonce hash, not the IP fingerprint, so unrelated guests on the same network can still answer. Production should replace this with a durable IP/device/session limiter at the edge or in Postgres.

Local MVP store mutations are serialized in-process so rapid same-instance submits cannot overwrite accepted responses. Supabase mode also takes a Postgres-backed runtime lock around the whole-store mutation path. Production should still move hot paths to row-level transactional inserts/updates for better scale and simpler failure recovery.

Sensitive local-store actions audit log check creation, response submit/delete, check claim, Premium mock checkout outcomes, and admin close/delete actions.

## Secrets

`.env.local` and all local env variants are gitignored. Supabase publishable keys are allowed in client env. Service-role keys and Stripe secrets must stay server-only.
