# Design System

The web UI implements the `Sayable.dc.html` Claude Design spec — a dark, editorial
look applied over the existing routes and the deterministic `packages/core` engine
(no business logic changed by the reskin).

## Tokens & type (`apps/web/app/globals.css`)

- **Surfaces:** background `#15120D` (with subtle radial gradients + a fixed dot-grid
  `.grain` overlay), cream cards `#F7F1E4`, dark inner panels `#1C1711`.
- **Accents:** lime `#C6F24E`, sage `#46B377`, honey `#E0A93A`/`#F2C14E`, clay `#DD7355`,
  mint eyebrow `#9FE6B6`. Verdict tones use darkened foregrounds (`--tone-*-fg`) so chips
  and labels clear WCAG AA on cream.
- **Type (via `next/font`, `layout.tsx`):** Bricolage Grotesque (display), Hanken Grotesk
  (body), Instrument Serif (italic accent words), JetBrains Mono (uppercase micro-labels).
  Exposed as `--type-display/body/serif/mono`; `next/font` self-hosts with `display:swap`.
- The class API (`.card`, `.tool-panel`, `.btn-*`, `.pill`, `.verdict-chip`, `.gauge`,
  `.dock`, `.editorial-row`, `.snapshot`, etc.) is shared across all pages and respects
  `prefers-reduced-motion`.

## Screen → route mapping

| Design screen | Route(s) | Component |
|---|---|---|
| Home | `/` | `app/page.tsx` (server) |
| Create | `/create` | `CreateCheckForm` |
| Answer | `/c/[guestToken]` | `GuestCheckClient` (intro + phone frame) |
| Results | `/h/[hostToken]`, `/dashboard/checks/[id]/results`, public `/r/[resultToken]` | `HostResultsClient`, snapshot page |
| Dashboard | `/dashboard` | `DashboardClient` |
| (post-create) Review | `/checks/[hostToken]/review`, dashboard variant | `HostReviewClient` |

The fixed bottom **dock** (`components/DockNav.tsx`) is route-aware: Home/Create/Checks are
real links; Answer/Results are non-navigable contextual indicators (reached only via a
shared/token link) rendered as dimmed, non-interactive labels.

## Conventions / gotchas

- Per-check **themes** apply as an accent only (host result accent + link-preview imagery);
  the guest answer page and public `/r/` snapshot keep the neutral dark layout. They do NOT
  recolor the whole page (the old `--accent/--soft/--paper/--ink` page override was removed
  so it can't clobber the dark tokens).
- `next/font` variables are aliased to `--type-*`; never redefine `--font-*` in CSS.
- Supabase-free client helpers (`postAnalytics`, `copyText`) live in `components/client-io.ts`
  so always-on consumers (e.g. `WebAnalytics` in the layout) do not pull `@supabase/supabase-js`
  into the first-load JS of public pages.
- Token-scoped client screens server-seed `initialData` (guest `/c/`, host results `/h/`) to
  avoid a client round-trip / loading flash; they also fetch directly in the mount effect
  (never via `setTimeout(0)`, which React 19 Strict Mode cancels in dev).
- `next.config.mjs` sets `allowedDevOrigins: ["127.0.0.1", "localhost"]` so dev HMR works from
  either loopback origin.
