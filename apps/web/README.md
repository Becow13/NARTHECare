# apps/web — NARTHECare caregiver dashboard

Next.js 14 + React 18 + Tailwind 3 + shadcn-style primitives. This is
the **primary MVP** for NARTHECare. The iOS app is a HealthKit sync
companion only during the web MVP phase — see
[`../../docs/web-mvp-plan.md`](../../docs/web-mvp-plan.md).

## Quick start

```bash
cd apps/web
cp .env.example .env.local            # set NEXT_PUBLIC_ALLOW_MOCKS=true
npm install
npm run dev                           # http://localhost:3000
```

The app boots into `/dashboard` (Care Hub) and renders all eight prototype
screens from `lib/mock-data.ts`. There is no real backend wiring yet — that
arrives in Phase 3.

## Routes

| Path | Page | Notes |
| --- | --- | --- |
| `/` | redirect | → `/dashboard` |
| `/dashboard` | Care Hub | Stat cards + Care Member Snapshot table |
| `/seniors` | Care Members list | |
| `/seniors/[id]` | Care Member detail | Header, vitals, alerts, AI summary, CTAs |
| `/alerts` | Alert feed | Filters by severity / category / member |
| `/appointments` | Appointments | Days-until pill |
| `/insights` | AI summary feed | Filter by member / type / urgency |
| `/action-plans` | Action plans | Grouped Open / In Progress / Complete |
| `/settings` | Settings | Save disabled in Phase 1 |
| `/patients/[id]` | redirect | → `/seniors/[id]` (legacy) |

## Phase status

| Phase | Status | What lands |
| --- | --- | --- |
| 1 | **Done** | Visual port. All routes render from mocks. |
| 2 | Pending | Cognito Hosted UI, `lib/apiClient.ts`, httpOnly cookie session, `middleware.ts` |
| 3 | Pending | Per-route swap: mocks → real backend calls |
| 4 | Pending (backend) | New tables: observations, alerts, summaries, appointments, action plans |
| 5 | Pending | Web deploy target (Vercel or 2nd Aptible app), separate from backend |

## Healthcare rules (non-negotiable)

These mirror the global rules in
[`../../.cursor/rules/narthecare-general-healthcare.mdc`](../../.cursor/rules/narthecare-general-healthcare.mdc):

- **No PHI in any log** — name, contact info, vitals, conditions, medications,
  notes, AI summary text, FHIR or HealthKit payloads. Browser console too.
- **No tokens in any log or `NEXT_PUBLIC_*` env** — JWTs, cookies, bearer
  headers stay server-side. Phase 2 wires httpOnly cookies via
  `lib/apiClient.ts`; never reach for `document.cookie` or
  `window.localStorage` for auth state.
- **UUIDs only in URL paths** — `/seniors/[id]` is fine because `id` is a UUID.
  Never put a name, email, or other identifier in a URL segment or query
  string.
- **Sanitized error surfaces** — render generic error pages on 4xx/5xx. Do
  not display raw backend error messages to users.
- **AI surfaces (`/insights`, `/action-plans`)** — never diagnostic. Keep the
  prototype's "Ways To Support" framing. Always cite evidence.
- **Mock gate** — `lib/mock-mode.ts` throws at module load if a production
  build ever loads `lib/mock-data.ts` without `NEXT_PUBLIC_ALLOW_MOCKS=true`.

## Cross-workspace imports

The web app may import from `shared/models/` via the `@models/*` path alias
in `tsconfig.json`. Do **not** import from `apps/backend/`. Cross-app talk
goes over HTTP only.

## What lives where

```
apps/web/
  app/                    Route segments (Next.js App Router)
    layout.tsx            Sidebar + main shell
    page.tsx              Redirect to /dashboard
    dashboard/            Care Hub
    seniors/              Care Members list + detail
    alerts/               Alert feed
    appointments/         Appointments
    insights/             AI summaries
    action-plans/         Action plans
    settings/             Settings (Save disabled)
    patients/[id]/        Legacy redirect
  components/
    sidebar.tsx           Persistent left nav
    care-team-list.tsx    "show all N" collapsible list
    data-sources-list.tsx
    data-freshness-badge.tsx
    senior-tabs.tsx
    sparkline.tsx
    vitals-legend.tsx
    ui/                   shadcn primitives
  lib/
    mock-data.ts          Synthetic Care Member fixtures (gated)
    mock-mode.ts          Production safety gate
    alert-rules.ts        Alert taxonomy + thresholds
    utils.ts              cn(), formatRelativeTime, etc.
  public/brand/           Brand SVGs
  docs/web-app.md         App-level architecture notes
```

## Useful commands

```bash
npm run dev            # next dev with hot reload
npm run build          # production build
npm run lint           # next lint
npm run typecheck      # tsc --noEmit
```
