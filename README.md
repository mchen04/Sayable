# Sayable

Sayable is an iMessage-first Comfort Check MVP. Hosts create a check without logging in, Sayable deterministically drafts the questions/tiers/constraints/share copy, guests answer from a no-login web link, and the host sees a privacy-safe aggregate result plus a final message to share back.

## Workspace

- `apps/web` - Next.js web/link layer, API routes, landing page, guest flow, host fallback, legal/trust pages, mock Premium Check flow, and operator route.
- `apps/mobile` - Expo React Native host shell using Expo Router, SecureStore, native share, and the web API.
- `packages/core` - deterministic no-LLM draft/result/theme/limit engine plus stress tests.
- `supabase/migrations` - Postgres schema and RLS contract.
- `docs` - setup, security, testing, operations, and validation notes.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev:web
```

Default local web URL: `http://localhost:3000`.

Required public Supabase env:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://pcebhhomchgvhoofnynf.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_PUBLIC_KEY
```

Stripe is intentionally mocked for MVP smoke:

```bash
STRIPE_MODE=mock
```

## Verification commands

```bash
npm run typecheck
npm run lint
npm run guard:no-llm
npm run test
npm run test:mutations
npm run smoke:web
npm run build
npm run verify
npm audit --audit-level=high
```

Local smoke defaults to `SAYABLE_STORE_BACKEND=file`, writing `.sayable-data/store.json` with no secrets. For a Supabase/Postgres-backed runtime, apply `supabase/migrations/0001_sayable_mvp.sql`, set `SAYABLE_STORE_BACKEND=supabase`, and set `SAYABLE_SUPABASE_SERVICE_ROLE_KEY` plus `SAYABLE_TOKEN_ENCRYPTION_KEY` only in the server environment. The publishable Supabase key remains client-safe; server keys must never ship to browser or mobile bundles.

## MVP limitations

- Google OAuth is feature-flagged. Local demo browser claims work only with `SAYABLE_DEMO_AUTH_ENABLED=true`; production should leave demo auth disabled and use Supabase Auth.
- Stripe Checkout is behind an adapter boundary. `STRIPE_MODE=mock` supports local smoke outcomes; `STRIPE_MODE=test` creates Checkout Sessions when test keys are configured and unlocks Premium only from the verified webhook path.
- Independent adversarial convergence loops and `/criticality-loop` are recorded as required gates in `validation/adversarial-loops.md` and still need to be run to final completion.

Launch packaging, production env, deployment, and screenshot capture notes are in `docs/launch.md`.
