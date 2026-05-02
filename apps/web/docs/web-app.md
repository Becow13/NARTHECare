# NARTHECare web app — architecture notes

> **Phase 1 (Done):** verbatim port of the founder's Next.js prototype
> under `apps/web/`. All eight routes render from `lib/mock-data.ts`.
> **Phase 2 (Done):** Cognito Hosted UI sign-in, sealed httpOnly session
> cookie, edge auth middleware, server-side `apiClient` foundation. Mock
> data still drives every dashboard screen — Phase 3 swaps routes one
> by one. The plan that drives this work lives at
> [`../../docs/web-mvp-plan.md`](../../docs/web-mvp-plan.md).

## Tech choices

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 14 App Router | Matches prototype exactly; server components let us forward Cognito JWTs server-side in Phase 2 |
| Language | TypeScript 5 strict | Same as prototype; aligns with `shared/models/` |
| Styling | Tailwind 3.4 + shadcn primitives | Direct prototype port |
| Charts | `recharts` | Sparklines on member detail (40px lines) |
| Icons | `lucide-react` | Used throughout prototype |
| Data (today) | `lib/mock-data.ts` | Synthetic fixtures, gated by `NEXT_PUBLIC_ALLOW_MOCKS` |
| Data (Phase 3) | `lib/apiClient.ts` server fetch | Forwards Cognito JWT, never logs body |

## Routing model

Next.js App Router under `app/`. Each route is a folder with `page.tsx`.
Pages that consume client interactivity (filters, expandable lists, the
mobile sidebar toggle) opt into `"use client"`; the rest stay server
components so Phase 3 can do server-side fetches without re-architecture.

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

The middleware at `apps/web/middleware.ts` runs on the Edge and only
checks **whether the sealed cookie is present**. It cannot decrypt
because iron-session needs Node APIs. The real validation happens in
`(app)/layout.tsx`, which calls `getSessionUser()` and redirects on
miss. This is by design: the middleware short-circuits the obvious
"no cookie at all" case so unauthenticated traffic never reaches a
dashboard render, while the Node-side decryption stays in one place.

Refresh handling lives in `services/apiClient.ts`. Before every
backend call we look at the cached `idTokenExpiresAt`; if it is within
60 s, we exchange the stored refresh token for a fresh ID token via
`cognitoService.refreshTokens()` and persist the rotation back to the
session cookie via `sessionService.rotateSessionTokens()`.

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

## What's intentionally not here yet

- **Backend calls** — no `fetch` to Aptible from any UI page yet.
  `services/apiClient.ts` exists as the Phase 3 entry point.
- **`/api/me` proxy** — Phase 3 wires the sidebar / settings up to a
  server-fetched user row. Today the sidebar reads display name from
  the session cookie (which already holds the verified Cognito claims).
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
