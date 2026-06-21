# Launch Packaging

## Assets

- Web favicon: `apps/web/public/favicon.svg`
- Web manifest: `apps/web/public/manifest.webmanifest`
- Expo app icon: `apps/mobile/assets/icon.png`
- Expo splash image: `apps/mobile/assets/splash.png`
- Source mark: `apps/mobile/assets/icon.svg`
- Default OG/Twitter image: `GET /api/og/check/default`
- Per-link OG/Twitter image: `GET /api/og/check/:guestOrResultToken`

## Screenshot-Ready Routes

These capture the dark editorial `Sayable.dc.html` UI (see `docs/design.md`). Use the
production web URL and capture these routes after seeding a check:

- `/` for the first-viewport create experience
- `/checks/:hostToken/review` for host review, share controls, Premium, and themes
- `/c/:guestToken` for the no-login guest response page
- `/h/:hostToken` for host results and final share
- `/r/:resultToken` for the public-safe result snapshot
- `/dashboard` after demo or Supabase Google sign-in

Capture at `390x844`, `844x390`, `768x1024`, `1024x700`, and `1440x900`.

## Production Env Checklist

- `NEXT_PUBLIC_WEB_BASE_URL` set to the deployed HTTPS origin
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the owned Supabase project
- `SAYABLE_STORE_BACKEND=supabase`
- `SAYABLE_SUPABASE_SERVICE_ROLE_KEY` set only on the server
- `SAYABLE_TOKEN_ENCRYPTION_KEY` set only on the server
- `SAYABLE_ADMIN_TOKEN` set only on the server
- `SAYABLE_TRUST_PROXY_HEADERS=true` for any deploy behind a proxy/load balancer (required so rate limits and the anonymous create-cap key on the real client IP rather than collapsing to a single shared bucket)
- `SAYABLE_DEMO_AUTH_ENABLED` unset or `false` (if enabled in production, `SAYABLE_DEMO_AUTH_SECRET` is required or the server refuses demo sessions)
- Supabase Google OAuth configured before `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true`
- `STRIPE_MODE=test` for real production billing (mock grants Premium without payment). In production, mock checkout is refused unless `SAYABLE_ALLOW_MOCK_BILLING=true` is explicitly set for a demo build.
- `EXPO_PUBLIC_WEB_BASE_URL` set before building the native app so universal link hosts are generated from the real web origin

## Deployment Checklist

1. Apply all migrations in `supabase/migrations/` (`0001`–`0005`) via `supabase db push` (or `supabase migration up` against the linked project).
2. Deploy the Next.js app with server-only secrets scoped to API/server runtime.
3. Run `npm run verify` and `npm audit --audit-level=high`.
4. Run `npm run smoke:web` against an isolated production-like store.
5. Open `/api/health` and verify `stripeMode` and Supabase configuration.
6. Capture screenshot-ready routes across required viewports.
7. Inspect active guest/result link metadata for canonical URL, OG/Twitter title, description, and image.
8. Verify `/api/admin` rejects anonymous requests and accepts the configured admin token.
9. Build Expo with `EXPO_PUBLIC_WEB_BASE_URL` pointing at the deployed web origin.
