# NARTHECare web app — architecture notes

> **Phase 1 (Done):** verbatim port of the founder's Next.js prototype
> under `apps/web/`. All eight routes render from `lib/mock-data.ts`.
> **Phase 2 (Done):** Cognito Hosted UI sign-in, sealed httpOnly session
> cookie, edge auth middleware, server-side `apiClient` foundation.
> **Phase 3 (Done):** `/seniors` and the `/seniors/[id]` profile rail load
> through `GET /api/data/**` Route Handlers that call `services/
> careRecipientService.ts` + `apiClient` (browser `fetch` keeps Cognito
> silent-refresh cookie writes legal — see §Real-data surface). The rest of
> the detail page and the other routes stay on `lib/mock-data.ts` pending
> Phase 4 tables. The plan that drives this
> work lives at [`../../docs/web-mvp-plan.md`](../../docs/web-mvp-plan.md).

## Tech choices

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 14 App Router | Matches prototype exactly; server components let us forward Cognito JWTs server-side in Phase 2 |
| Language | TypeScript 5 strict | Same as prototype; aligns with `shared/models/` |
| Styling | Tailwind 3.4 + shadcn primitives | Direct prototype port |
| Charts | `recharts` | Sparklines on member detail (40px lines) |
| Icons | `lucide-react` | Used throughout prototype |
| Data (`/seniors`, `/seniors/[id]` header) | `GET /api/data/**` Route Handlers → `careRecipientService` → `apiClient` | Browser pages `fetch` JSON proxies so token refresh may mutate cookies |
| Data (everything else) | `lib/mock-data.ts` | Synthetic fixtures, gated by `NEXT_PUBLIC_ALLOW_MOCKS` |

## Routing model

Next.js App Router under `app/`. Each route is a folder with `page.tsx`.
Pages that consume client interactivity (filters, expandable lists, the
mobile sidebar toggle) opt into `"use client"`; the rest stay server
components for cheap SSR where possible. `/seniors` and `/seniors/[id]`
are Client Components **only** so their `fetch("/api/data/…")` calls
receive JSON plus rotated session cookies — calling `careRecipientService`
directly from an RSC would throw because Cognito silent refresh writes to
iron-session (`cookies can only be modified in a Server Action or Route
Handler`).

Phase 2 split the route tree into two route groups so the auth surface
can render full-bleed without the sidebar:

- `app/(app)/**` — authenticated routes. The group's `layout.tsx`
  fetches the session via `getSessionUser()`, redirects to
  `/auth/sign-in` if missing, and renders the sidebar shell around the
  child page.
- `app/auth/**` — public auth pages (`/auth/sign-in`, `/auth/error`).
  Inherits the minimal root `layout.tsx` (just `<html><body>`).
- `app/api/auth/**` — server route handlers for the OAuth flow.
  Marked `dynamic = "force-dynamic"` so Next never tries to prerender
  them.
- `app/api/data/**` — authenticated JSON proxies for Aptible reads used by
  Phase 3 (`care-recipients`, …). Same runtime constraints — Node +
  `force-dynamic`.

The legacy `app/(app)/patients/[id]/page.tsx` is a permanent redirect to
`/seniors/[id]`. We collapsed the old `apps/web/app/patients/[id]/profile/`
stub into the prototype's unified Care Member detail page so there is
exactly one canonical detail screen per recipient.

## Auth surface (Phase 2)

```
Browser ──► /api/auth/login            (state cookie set, 302 to Cognito)
Cognito ──► /api/auth/callback?code=…  (code exchange + ID token verify)
            └─ services/sessionService.createSessionFromTokens()
               └─ iron-session sealed cookie (__nc_session)
Browser ──► /dashboard                 ((app)/layout.tsx fetches session)
```

The middleware at `apps/web/middleware.ts` runs on the Edge and checks
**whether any sealed-session cookie chunk is present** before dashboard
navigation so anonymous traffic never flashes the caregiver shell.
`/api/data/**` bypasses that redirect so browser `fetch()` receives JSON
status codes (`401`, …) instead of an HTML redirect body — Route Handlers
still authenticate via iron-session + `apiClient`. The middleware cannot
decrypt the cookie (iron-session needs Node).

`(app)/layout.tsx` calls `getSessionUser()` for the real decrypt +
identity gate and redirects to `/auth/sign-in` on miss.

Refresh handling lives in `services/apiClient.ts`, invoked from Route
Handlers (`app/api/data/**`) so `sessionService.rotateSessionTokens()` may
call iron-session `save()` legally. Before each Aptible hop we reuse an
in-memory ID-token cache keyed by Cognito `sub`; inside the leeway window we
exchange the refresh token at Cognito and persist the rotated refresh /
expiry back into the sealed cookie.

### What we deliberately store in the cookie

Only the verified Cognito ID token + refresh token + the minimal
identity fields the sidebar needs (`displayName`, `email`,
`emailVerified`, `cognitoSub`). No PHI. No backend response payloads.
No access token (we forward the ID token to our backend).

### Dev bypass

`DEV_AUTH_BYPASS=true` mirrors the backend env var of the same name.
When set on a non-production node env, `/api/auth/login` skips Cognito
entirely and seeds a stable "Dev Caregiver" session. Production fails
boot if the flag is set (`assertDevAuthBypassAllowed`).

### Logging rules (PHI / token safety)

- **Never** logged: response bodies, request bodies, `Authorization`
  headers, the cookie value, ID / refresh tokens, raw Cognito error
  bodies (which can echo the request).
- **Allowed** in logs: HTTP method, path, status code, error class
  name, truncated (≤ 120 char) error messages from helpers we control.
- The auth pages NEVER render raw Cognito output — every user-visible
  failure mode passes through `lib/auth/errors.ts#authErrorMessage`.

## Visual language

Tokens live in `tailwind.config.ts` and `app/globals.css`.

| Token | Value | Use |
| --- | --- | --- |
| `narthe.green` / `--primary` | `#1D9E75` | Buttons (`Button` default), Live badge, "show all N" link |
| Visual accent | `#3B5BDB` | Sidebar logo background, active nav bg `#EEF0FF`, link hovers, focus ring |
| State good | `emerald-500/600` | Routine status, "within range" indicator |
| State watch | `amber-500/600` | Monitor status, "monitor" alert |
| State bad | `red-500/600` | Critical status, "act today" alert |
| Card surface | `bg-white dark:bg-gray-900 border border-border` | All info cards |
| Card corner | `rounded-lg` (8 px) | Default (some primitives use `rounded-xl`) |

## Status / risk vocabulary

We keep two parallel vocabularies on purpose — see `docs/prototype-analysis.md §6`:

| Surface | Values |
| --- | --- |
| Dashboard / alert | `routine` · `monitor` · `critical` |
| Care recipient profile (clinical) | `low` · `moderate` · `high` |

Mapping happens at the page level, not in shared types.

## Mock data safety

`lib/mock-data.ts` imports `assertMocksAllowed()` from `lib/mock-mode.ts`
at module load. The gate throws if `NODE_ENV === "production"` and
`NEXT_PUBLIC_ALLOW_MOCKS !== "true"`, so any production deploy that
forgets to wire real data fails fast at boot rather than silently
serving synthetic PHI-shaped fixtures to caregivers.

Senior IDs are UUIDs (`11111111-1111-4111-a111-111111111111`,
`22222222-…`, `33333333-…`) so the same `[id]` slug works for both the
mock and the eventual `care_recipients.id` column on the backend.

## Real-data surface (Phase 3)

`services/careRecipientService.ts` is the single service entry for Aptible
care-recipient reads. **Call it from Route Handlers (or Server Actions), not
from React Server Components**, whenever `apiClient` might need to refresh —
`rotateSessionTokens` writes cookies, which Next forbids during RSC render.

Phase 3 ships two handlers + matching browser clients:

| Method | Aptible endpoint | Next route | Browser consumer |
| --- | --- | --- | --- |
| `listCareRecipients()` | `GET /care-recipients` | `GET /api/data/care-recipients` | `app/(app)/seniors/page.tsx` |
| `getCareRecipientProfile(id)` | `GET /care-recipients/:id/profile` | `GET /api/data/care-recipients/[id]/profile` | `app/(app)/seniors/[id]/page.tsx` |

Phase 4 will add sibling methods (`listAlerts`, `listObservations`,
`listSummaries`, `listAppointments`, `listActionPlans`,
`listDataSources`) on the same module; every URL stays rooted at
`/care-recipients/:id/...` so `care_recipient_id` remains the
single partition key.

### Shape translation (`lib/adapters/careRecipientToSenior.ts`)

The backend list endpoint returns a deliberately thin row
(`id, name, date_of_birth, primary_condition, role, permission_level,
created_at, updated_at`). The prototype UI was written against a
rich `Senior` view model. The adapter is a **one-way, pure**
module that bridges the two:

- `careRecipientListRowToItem` — thin backend row → list view row.
- `careRecipientProfileToHeader` — full `CareRecipientProfile`
  contract → header-card view model.

Rules this adapter follows (and Phase 4 readers must too):

1. Never throw on missing fields. A half-populated row must still
   render something reasonable — a thrown adapter error would mask
   auth-layer failures as server errors.
2. Never fabricate PHI. Unknown phone / email / organization /
   lastSync fall through as empty strings or `null`; the UI
   components (`CareTeamList`, `DataSourcesList`) have been taught
   to skip those rows rather than echo "unknown".
3. Map enum → display exactly once, in this file. `riskLevel →
   status` ("low"/"moderate"/"high" → "routine"/"monitor"/
   "critical") and `DataSourceType → UI type` + `display name` live
   in named constants so Phase 4 readers can import the same maps.
4. Pure. No I/O, no logs, no dependencies on `server-only`. Safe
   for unit tests and future server-or-client-side reuse.

### Phase 3 error handling (browser + proxies)

Client pages issue `fetch("/api/data/…", { cache: "no-store" })` with
same-origin credentials. They **never** parse error JSON bodies into UI
copy (messages may be PHI-adjacent):

- `401` → `router.replace("/auth/sign-in")`.
- List: any other non-OK → generic “unable to load” card.
- Detail: `404` from the proxy → “not found / no access” (Aptible `403` is
  mapped to `404` inside the proxy). Non-UUID `[id]` → same copy without
  calling the proxy.
- Proxies log only tagged status / error class — **no payloads, no cookies**.

## What's intentionally not here yet

- **Below-header on `/seniors/[id]`** — AI summary, vitals
  cards, 7-day panel, alert history, tabs all render empty states.
  `seniors/[id]/senior-profile-client.tsx` is the single place
  Phase 4 will swap in real data.
- **`/api/me` proxy** — still future work. Today the sidebar reads
  display name from the session cookie (which already holds the
  verified Cognito claims).
- **Settings persistence** — Save button is rendered disabled. Backend
  endpoint `PATCH /api/me` does not exist yet.
- **`apps/web` deploy target** — Phase 5 adds a Dockerfile and CI workflow
  separate from `aptible.yml`. The current Aptible image excludes
  `apps/web/` (see root `.dockerignore` line 20).
- **Real data bindings** for `/alerts`, `/insights`, `/action-plans`,
  `/appointments`, dashboard table — Phase 4 adds the backend tables and
  endpoints these need.

## Files NOT ported from the prototype

We dropped these intentionally:

- `Foundational Dashboard Code.js` — standalone HTML demo, predates the
  React port.
- `lib/mock-data Broken.ts` — broken draft.
- `app/dashboard/page.tsx.backup.tsx` — old backup.
- `findstr` — empty stray file.

If you need to inspect them, they remain in
`/Users/d2118370gmail.com/Downloads/NARTHECare/Prototype Code/`.
