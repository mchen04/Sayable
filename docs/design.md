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
  `.dock`, `.editorial-row`, `.snapshot`, `.constraint-chip`, `.note-toggle`, etc.) is shared
  across all pages and respects `prefers-reduced-motion`. `.constraint-chip` is the cream
  toggle-pill used for the guest's optional constraints (selected via `[data-selected]`);
  `.note-toggle` is the tap-to-reveal affordance for the optional private note.

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
- The guest answer form stays low-pressure, not survey-like: the optional constraints render as
  compact wrap toggle-chips (`.constraint-chip`) and the private note sits behind a tap-to-reveal
  disclosure (`.note-toggle`). A closed/expired check shows its locked-state banner *inside* the
  phone-frame form (not only the desktop intro column) so phones never hit a silent dead-end.
- The OG / link-preview card (`/api/og/check/*`) uses the dark-editorial palette (dark page +
  dark panel + the per-check accent + cream text) so the share image matches every in-app surface;
  it carries only the title + public-safe verdict line (no names, counts, budgets, or notes).
