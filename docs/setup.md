# Setup

## Web

```bash
npm install
cp .env.example .env.local
cp .env.example apps/web/.env.local
npm run dev:web
```

Set `NEXT_PUBLIC_WEB_BASE_URL` to the externally reachable deployment URL before sharing real links. The Next.js workspace app loads `apps/web/.env.local` when run through `npm run dev:web`, `npm run build`, or `npm run start -w @sayable/web`; repo scripts such as `npm run check:supabase` read both root and `apps/web` env files.

For local demo Google-session signing, set a random secret:

```bash
SAYABLE_DEMO_AUTH_ENABLED=true
SAYABLE_DEMO_AUTH_SECRET=$(openssl rand -base64 32)
```

## Expo host app

```bash
npm run dev:mobile
```

Set `EXPO_PUBLIC_WEB_BASE_URL` to the web app URL. The app creates checks through the web API, stores the last host token in Expo SecureStore, opens the web review flow before first share, and uses the native share sheet for final messages.
Expo config is generated from `apps/mobile/app.config.js`; set `EXPO_PUBLIC_WEB_BASE_URL` before native builds so iOS associated domains and Android intent-filter hosts match the deployed HTTPS origin.

## Supabase

Apply all migrations in `supabase/migrations/` (`0001`–`0005`) in the owned Supabase project. RLS is enabled on all MVP tables. Anonymous direct table access is intentionally not granted; public token flows must go through server routes or Edge Functions that hash and validate tokens.

### Local Supabase (CLI) verification

With Docker running, the local stack is the fastest way to verify the schema, RLS, advisors, and runtime end to end:

```bash
supabase init                 # one-time; creates supabase/config.toml
supabase start                # boots local Postgres/Auth/REST/Realtime
supabase db reset             # applies 0001-0005 from supabase/migrations
supabase migration list       # confirm 0001-0005 applied
supabase db lint              # expect: No schema errors found
supabase db advisors --type security
supabase db advisors --type performance   # both expect: 0 findings

# Point the app/checks at the local stack (values from `supabase status`):
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
export SAYABLE_SUPABASE_SERVICE_ROLE_KEY=<local secret key>
export SAYABLE_STORE_BACKEND=supabase
export SAYABLE_TOKEN_ENCRYPTION_KEY=local-dev-32-byte-secret
npm run check:supabase        # expect: { ok: true, ... }
npm run smoke:web             # runs the full flow against local Supabase
```

Local CLI keys are well-known dev values printed by `supabase status` — never commit them.

### Hosted Supabase

To apply migrations to the hosted project, link the CLI (`supabase link --project-ref <ref>`) then run `supabase db push`, or use a Supabase Postgres connection string with database admin access (**Project Settings > Database > Connection string**). The publishable key and server API key are runtime credentials; they do not create missing tables or functions.

Local no-secret smoke uses the file backend:

```bash
SAYABLE_STORE_BACKEND=file
SAYABLE_STORE_PATH=.sayable-data/store.json
```

Production/staging runtime can use Supabase/Postgres persistence:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SAYABLE_STORE_BACKEND=supabase
SAYABLE_SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
SAYABLE_TOKEN_ENCRYPTION_KEY=server-only-random-32-byte-secret
```

The service-role and token-encryption keys are server-only and must not be exposed to browser/mobile bundles. The Supabase runtime writes normalized `comfort_checks`, `responses`, `purchases`, `result_snapshots`, `analytics_events`, `audit_logs`, and `abuse_events` rows, and uses the `sayable_store_locks` table plus RPC helpers to serialize MVP whole-store mutations across app instances. RLS remains enabled on those tables so browser clients using the publishable key cannot list or mutate private runtime data directly.

Local file mode will create an ignored `${SAYABLE_STORE_PATH}.key` file if `SAYABLE_TOKEN_ENCRYPTION_KEY` is unset, so dev share links survive a server restart. Supabase mode does not create a fallback key; deployment must provide `SAYABLE_TOKEN_ENCRYPTION_KEY`.

Check Supabase readiness without printing secrets:

```bash
npm run check:supabase
```

The check validates the public Auth settings endpoint with the publishable key, then uses the server-only service-role key to read the runtime tables and exercise the lock RPC. A publishable key alone is not enough for `SAYABLE_STORE_BACKEND=supabase`; RLS intentionally prevents browser-key clients from writing the private runtime store.

## Google OAuth

Set up Google as a Supabase Auth provider, then set:

```bash
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
```

Until provider credentials are configured, the app shows the post-value "Continue with Google" path as a local demo claim and documents the missing production setup.
The local demo session is signed server-side and only works when `SAYABLE_DEMO_AUTH_ENABLED=true`. Leave that flag unset in production; production owner identity comes from Supabase Auth bearer/session verification.

## Stripe

MVP smoke mode:

```bash
STRIPE_MODE=mock
```

Future test mode:

1. Set `STRIPE_MODE=test`.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. Create Checkout Sessions for `premium_check_upgrade`.
4. Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/billing/webhook`.
5. Use test card `4242 4242 4242 4242`, future expiry, any CVC, valid ZIP.
6. Premium unlocks only after a verified `checkout.session.completed` webhook; client-side outcome simulation is accepted only in `STRIPE_MODE=mock`.
7. Checkout success/cancel redirects go to `/billing/return` with Stripe's session id, not a host token. The return API verifies the signed host session before the browser reopens a locally remembered host review link.
