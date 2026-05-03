# apps/web — NARTHECare caregiver dashboard

Next.js 14 + React 18 + Tailwind 3 + shadcn-style primitives. This is
the **primary MVP** for NARTHECare. The iOS app is a HealthKit sync
companion only during the web MVP phase — see
[`../../docs/web-mvp-plan.md`](../../docs/web-mvp-plan.md).

## Quick start

```bash
cd apps/web
cp .env.example .env.local
# Required for local dev:
#   SESSION_COOKIE_SECRET=<openssl rand -hex 32>
#   APP_BASE_URL=http://localhost:3100
#   NEXT_PUBLIC_ALLOW_MOCKS=true
#   DEV_AUTH_BYPASS=true     # so you don't need real Cognito creds
npm install
npm run dev                           # http://localhost:3100
```

Hitting any URL without a session redirects to `/auth/sign-in`. With
`DEV_AUTH_BYPASS=true`, the sign-in button mints a local "Dev Caregiver"
session and drops you on `/dashboard` — no Cognito round-trip required.
Without the bypass, the button redirects to the Cognito Hosted UI for
the configured user pool.

All eight Care Hub screens still render from `lib/mock-data.ts` in
Phase 2 — mock-to-real swaps are the Phase 3 work.

## Routes

Authenticated routes live in the `app/(app)/` route group, which adds the
sidebar + main shell and enforces auth in its layout. The auth surface
lives in `app/auth/` (no sidebar).

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
| `/settings` | Settings | Save still disabled until backend `PATCH /api/me` ships |
| `/patients/[id]` | redirect | → `/seniors/[id]` (legacy) |
| `/auth/sign-in` | Public sign-in | Button to Cognito Hosted UI (or dev-bypass) |
| `/auth/error` | Public auth error | Generic, never echoes Cognito output |
| `/api/auth/login` | Server route | Initiates Cognito Hosted UI flow |
| `/api/auth/callback` | Server route | Code exchange + session seed |
| `/api/auth/logout` | Server route | Clears local session + Cognito logout |

## Phase status

| Phase | Status | What lands |
| --- | --- | --- |
| 1 | **Done** | Visual port. All routes render from mocks. |
| 2 | **Done** | Cognito Hosted UI, sealed httpOnly session cookie, `middleware.ts`, `services/apiClient.ts`, dev bypass, sign-in / error pages, sidebar wired to session. |
| 3 | Pending | Per-route swap: mocks → real backend calls via `services/apiClient.ts` |
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
  middleware.ts           Edge auth gate — redirects unauthenticated traffic
  app/                    Route segments (Next.js App Router)
    layout.tsx            Minimal <html><body>; no sidebar
    page.tsx              Redirect to /dashboard
    (app)/                Authenticated route group
      layout.tsx          Sidebar + main shell, fetches session
      dashboard/          Care Hub
      seniors/            Care Members list + detail
      alerts/             Alert feed
      appointments/       Appointments
      insights/           AI summaries
      action-plans/       Action plans
      settings/           Settings (Save disabled)
      patients/[id]/      Legacy redirect
    auth/                 Public auth pages (no sidebar)
      sign-in/            Cognito Hosted UI launcher
      error/              Generic, safe error page
    api/auth/             Auth route handlers (login / callback / logout)
  components/
    sidebar.tsx           Persistent left nav (receives SessionUser prop)
    care-team-list.tsx    "show all N" collapsible list
    data-sources-list.tsx
    data-freshness-badge.tsx
    senior-tabs.tsx
    sparkline.tsx
    vitals-legend.tsx
    ui/                   shadcn primitives
  lib/
    auth/                 Pure auth helpers (no I/O)
      cognito-config.ts   Env loader, URL builders for Hosted UI
      cognito-identity.ts Claim-set parsing (mirrors backend)
      session-cookie.ts   iron-session config + cookie shape
      session.ts          getSession() / getSessionUser() — server-only
      dev-bypass.ts       DEV_AUTH_BYPASS sentinel (mirrors backend)
      errors.ts           Auth error code mapping
      __tests__/          vitest unit tests
    mock-data.ts          Synthetic Care Member fixtures (gated)
    mock-mode.ts          Production safety gate
    alert-rules.ts        Alert taxonomy + thresholds
    utils.ts              cn(), formatRelativeTime, etc.
  services/               Service layer (server-only side effects)
    cognitoService.ts     Code exchange, refresh, ID-token verify
    sessionService.ts     iron-session writes (create / rotate / clear)
    apiClient.ts          getJson / postJson — Phase 3 will consume
    index.ts              Barrel
  public/brand/           Brand SVGs
  docs/web-app.md         App-level architecture notes
  vitest.config.mts       lib/**/__tests__/**/*.test.ts
```

## Useful commands

```bash
npm run dev            # next dev with hot reload
npm run build          # production build
npm run lint           # next lint
npm run typecheck      # tsc --noEmit
npm test               # vitest run (lib/auth unit tests)
```
