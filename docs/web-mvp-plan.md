# NARTHECare Web-First MVP Plan

> **Established:** May 2, 2026
> **Source of truth for:** strategy, phase order, file changes, risks.
> Previous prototype analysis lives in [`docs/prototype-analysis.md`](prototype-analysis.md).

---

## Strategic shift

NARTHECare is now **web-first**. The caregiver-facing web dashboard is the
primary MVP target. The iOS app is a **HealthKit / Apple Health sync companion
only** — no new caregiver UI screens on iOS until the web MVP ships.

| Platform | Role |
| --- | --- |
| Web (`apps/web/`) | Primary MVP — full caregiver dashboard |
| Backend (`apps/backend/`) | Shared API — additive only; legacy `POST /health-data` stays through Phase 4A; new `POST /healthkit/sync` lands in Phase 4A |
| iOS (`apps/ios/`) | HealthKit sync companion. Phase 4A wires the HealthKit → backend write path and a minimal sync-status screen. **No** dashboard / care team / AI / Epic / alerts UI growth. |

---

## Prototype source of truth

```
/Users/d2118370gmail.com/Downloads/NARTHECare/Prototype Code/
  NARTHECare Dashboard Pages Code/   ← Next.js 14 caregiver dashboard
    app/                             ← 8 routes (see §1.2)
    components/                      ← sidebar, care-team-list, sparkline, etc.
    lib/                             ← mock-data.ts, alert-rules.ts, utils.ts
  narthecare-*.svg                   ← Brand marks → apps/web/public/brand/
  Foundational Dashboard Code.js     ← DROP — standalone HTML demo
```

Prototype is a **visual / product spec**, not a backend. All data is mocked.

---

## 1. Prototype summary

### 1.1 Stack

- Next.js 14.2.5 · React 18 · TypeScript 5 · Tailwind 3.4 (dark mode via class)
- shadcn primitives (`@radix-ui/react-*`, `class-variance-authority`, `clsx`,
  `tailwind-merge`)
- `lucide-react`, `recharts`
- `tsconfig` paths: `@/*` → `./*`
- Brand palette: `narthe.green = #1D9E75`; visual accent `#3B5BDB`; states
  emerald / amber / red

### 1.2 Routes

| Route | Page file | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Redirect to `/dashboard` |
| `/dashboard` | `app/dashboard/page.tsx` | Care Hub — stat cards + Care Member Snapshot table |
| `/seniors` | `app/seniors/page.tsx` | Care Members list |
| `/seniors/[id]` | `app/seniors/[id]/page.tsx` | Member detail — header / vitals / alerts / AI summary / CTAs |
| `/alerts` | `app/alerts/page.tsx` | Filterable alert feed |
| `/appointments` | `app/appointments/page.tsx` | Upcoming appointments |
| `/insights` | `app/insights/page.tsx` | AI summary feed |
| `/action-plans` | `app/action-plans/page.tsx` | Action plans grouped by status |
| `/settings` | `app/settings/page.tsx` | Account / Notifications / Privacy / Appearance |

### 1.3 Auth / onboarding

**The prototype has no auth.** `/` redirects unconditionally to `/dashboard`;
the sidebar footer hardcodes `"Becca Yang — Family Caregiver"`. Authentication,
session management, and onboarding are our responsibility to add in Phase 2.

### 1.4 Data types (from `lib/mock-data.ts`)

`Senior`, `Alert`, `AISummary`, `CareTeamMember`, `Appointment`, `DataSource`,
`VitalsReading`, `ActionPlan`. These are dashboard-shaped view models (not the
same as `CareRecipientProfile`). The mapping between them is documented in
`docs/prototype-analysis.md §4`.

---

## 2. Current repo vs prototype gap

| Concern | Prototype | Current repo | Gap |
| --- | --- | --- | --- |
| Web framework | Next.js 14, runnable | Single stub `page.tsx`, no `package.json` | Scaffold Next.js in `apps/web/` |
| Routes | 8 routes | 1 route (`/patients/[id]/profile`) | Add 7 routes; redirect old stub |
| Auth | None | Cognito JWT on backend | Wire Cognito Hosted UI in Phase 2 |
| Data | All mocked | `CareRecipientProfile` contract + backend endpoints | Port mock first; swap per-route in Phase 3 |
| Terminology | "Care Member" UI / `senior` code | `CareRecipient` data / "Patient" stub | Settle: **Care Recipient** in data, **Care Member** in UI |
| Tailwind | HSL tokens + `narthe.green` | None | Port to `apps/web/tailwind.config.ts` |
| Brand SVGs | In Downloads | Not in repo | Copy to `apps/web/public/brand/` |
| iOS scope | n/a | Full caregiver UI | **Pause iOS UI** — sync companion only |

---

## 3. Phase plan

### Phase 0 — Pivot decisions and guardrails ✅ (this phase)

Update docs, rules, and scope markers. No code touched (no backend, web, or
iOS source changes).

**Backend impact:** none. **Aptible impact:** none.

### Phase 1 — Scaffold runnable Next.js app (mock data)

Port the prototype verbatim under `apps/web/`. All eight routes render with
mock data. No backend calls. No login. Visual parity with the prototype.

Key constraints:
- `apps/web/package.json` pins the same versions as the prototype.
- `tsconfig` paths: `@/*` and `@models/* → ../../shared/models/*`.
- Mock data gated by `NEXT_PUBLIC_ALLOW_MOCKS` (default `false` in production).
- Mock IDs are UUIDs so `/seniors/[id]` shapes match both worlds.
- Sidebar footer reads from session (hardcoded "Becca Yang" replaced in Phase 2).
- Drop: `Foundational Dashboard Code.js`, `mock-data Broken.ts`,
  `page.tsx.backup.tsx`.
- Fold the existing `apps/web/app/patients/[id]/profile/page.tsx` stub into a
  redirect to `/seniors/[id]`.

**Backend impact:** none. **Aptible impact:** none
(`.dockerignore` already excludes `apps/web/`).

### Phase 2 — Auth, env, and thin API client ✅

**Done.** Hand-rolled Cognito Hosted UI (Authorization Code flow), sealed
httpOnly session cookie via `iron-session`, edge auth `middleware.ts`,
and the `services/apiClient.ts` foundation. Mock data still drives every
dashboard screen — Phase 3 swaps routes one by one.

Layout and routing changes:

- Authenticated routes moved into the `app/(app)/` route group, whose
  `layout.tsx` fetches the session via `getSessionUser()` and redirects
  to `/auth/sign-in` if missing.
- Public auth pages live at `app/auth/sign-in` and `app/auth/error`.
- OAuth route handlers at `app/api/auth/{login,callback,logout}` are
  marked `dynamic = "force-dynamic"`.
- `services/apiClient.ts` exposes `getJson` / `postJson` with inline
  refresh-token rotation (60 s leeway).

PHI / token safety verified:

- ID + refresh tokens stay in the sealed cookie; never reach the browser.
- Apps logs include only method + path + status. No bodies, no headers,
  no cookies, no tokens, no raw Cognito error bodies.
- Auth errors render through `lib/auth/errors.ts` only — no Cognito
  output ever reaches the user.
- `assertDevAuthBypassAllowed` mirrors the backend so production fails
  boot if `DEV_AUTH_BYPASS=true` is set.

Tests: 46 unit tests (`vitest run`) across `lib/auth/__tests__/**`.

**Backend impact:** none. **Aptible impact:** none.

### Phase 3 — Real data, one route at a time ✅

**Done.** Browser pages load Care Hub list + detail headers via JSON
proxies under `GET /api/data/**`. Those Route Handlers call `services/
careRecipientService.ts`, which forwards the caregiver's Cognito ID token
through `services/apiClient.ts`.

Why not call `careRecipientService` directly from React Server Components?
Silent Cognito refresh persists rotation through `sessionService.
rotateSessionTokens` → iron-session `save()`. Next.js only permits cookie
mutation inside Route Handlers / Server Actions — never during an RSC render,
which surfaced as `Cookies can only be modified in a Server Action or Route
Handler` when `/seniors` was a Server Component. Browser `fetch("/api/data/
…")` hits handlers where refresh + `Set-Cookie` are legal; middleware skips
the HTML redirect gate for `/api/data/**` so unauthenticated responses stay
JSON (`401`) instead of a sign-in redirect body.

Wired in Phase 3:
1. `/seniors` → browser `fetch("/api/data/care-recipients")` → Aptible
   `GET /care-recipients` — list page renders the thin list-endpoint shape
   (`id`, `name`, `date_of_birth`, `primary_condition`, `role`,
   `permission_level`, `updated_at`). Fields with no backend source yet
   (status, alert counts, last-seen) render honest neutral defaults — no
   fabricated PHI.
2. `/seniors/[id]` **profile rail** → browser `fetch("/api/data/
   care-recipients/:id/profile")` → Aptible `GET /care-recipients/:id/
   profile` — header card (avatar, name, age, conditions, care team,
   connected sources) maps 1:1 from the `CareRecipientProfile` contract
   via `lib/adapters/careRecipientToSenior.ts`.

Still mocked (Phase 4):
- Everything below the header on `/seniors/[id]` (AI summary card,
  vitals cards, vitals 7-day panel, alert history, tabs). The detail page
  mounts `seniors/[id]/senior-profile-client.tsx` which renders empty states
  rather than pulling from `lib/mock-data.ts` — we deliberately decoupled
  the detail page from the mock module so a production build can render the
  route without `NEXT_PUBLIC_ALLOW_MOCKS=true`.
- `/dashboard`, `/alerts`, `/appointments`, `/insights`,
  `/action-plans` still read from `lib/mock-data.ts`.

Error handling (client pages + proxies):
- Proxy `401` → list/detail replace to `/auth/sign-in`.
- Proxy `404` on profile → caregiver-facing “not found / no access” copy;
  Aptible `403` is collapsed into `404` JSON so existence is not leaked.
- Invalid `:id` (non-UUID) → immediate inline not-found — no fetch.
- Other proxy failures → generic inline error copy (no response bodies logged).

PHI / logging:
- `apiClient` log format already excludes bodies. Proxies never log payloads;
  pages never `console.log(profile)` or `console.log(list)`.
- The adapter is a pure module — no I/O, no logs.
- `CareTeamList` and `DataSourcesList` gracefully skip phone / lastSync rows
  the contract does not carry, rather than echo fake or misleading values.

Tests: 10 unit tests in `lib/adapters/__tests__/
careRecipientToSenior.test.ts` (56 passing across the suite).

**Backend impact:** none. **Aptible impact:** none.

#### Phase 4 schema sketch (forward-looking — NOT built in Phase 3)

The tables below are **sketches** so Phase 3 adapters, page props,
and URL shapes do not lock us out of the eventual backend. No SQL
or migration lands in this phase.

Design rules carried forward:
- `care_recipient_id UUID NOT NULL REFERENCES care_recipients(id)
  ON DELETE CASCADE` on every row — single partition key.
- `source_type TEXT` (`"apple_health" | "epic" | "manual" | …`) +
  `source_id TEXT NULL` (integration instance) + `source_record_id
  TEXT NULL` (provider's id) so any row can trace back to its
  origin without storing the raw payload.
- Optional `metadata JSONB` for non-PHI structured extensions only.
  Never for raw HealthKit / FHIR / LLM payloads.
- Timestamps: `created_at` / `updated_at` on every table;
  `observed_at` / `generated_at` on event-shaped tables.
- `requireCareRecipientAccess` gate on every read/write.
- Audit every read of these tables — `audit_logs.metadata` never
  contains PHI.
- TODO(embeddings): vector columns may be added in a later phase
  for longitudinal retrieval. Leave the door open; do not create
  empty `embedding` columns now.

Sketch — `health_observations`:
`id, care_recipient_id, metric_type` (`resting_heart_rate`, `hrv`,
`spo2`, `steps`, `sleep_duration`, `respiratory_rate`,
`walking_steadiness`, `fall_event` …), `value_numeric`,
`value_unit`, `observed_at`, `source_type`, `source_id`,
`source_record_id`, `metadata JSONB`, `created_at`. Unique
`(source_type, source_record_id)` for idempotent ingest.

Sketch — `ai_summaries`:
`id, care_recipient_id, summary_type` (`daily`, `anomaly`,
`post_visit`, …), `summary_text TEXT`, `evidence JSONB`,
`recommended_actions JSONB`, `model TEXT`, `prompt_version TEXT`,
`generated_at TIMESTAMPTZ`, `source_window_start TIMESTAMPTZ`,
`source_window_end TIMESTAMPTZ`, `metadata JSONB`, `created_at`.
Read via `GET /care-recipients/:id/summaries?type=daily&limit=…`.

Sketch — `alerts`:
`id, care_recipient_id, severity` (`critical` | `monitor` |
`routine`), `category`, `title`, `explanation`, `status` (`active`
| `acknowledged` | `resolved`), `observed_at`, `source_type`,
`source_record_id`, `metadata JSONB`, `created_at`,
`resolved_at`. Read via `GET /care-recipients/:id/alerts`.

Sketch — `metric_baselines`:
`id, care_recipient_id, metric_type, window_days`, `p10_numeric`,
`p50_numeric`, `p90_numeric`, `sample_count`, `computed_at`,
`metadata JSONB`. Recomputed nightly; never blocks a read path.

Sketch — `care_recipient_data_sources` (registry, not a copy):
`id, care_recipient_id, source_type`, `status` (`connected` |
`not_connected` | `error`), `last_synced_at`, `external_id TEXT`,
`error_message`, `created_at`, `updated_at`. Epic credentials live
in a separate `epic_connections` table (Phase 6+) — this registry
row points to it by `external_id`.

Read endpoint naming (fixed now for adapter siblings):
`GET /care-recipients/:id/observations`,
`GET /care-recipients/:id/summaries`,
`GET /care-recipients/:id/alerts`,
`GET /care-recipients/:id/appointments`,
`GET /care-recipients/:id/action-plans`,
`GET /care-recipients/:id/data-sources`. Every handler must chain
`requireCognitoUser → requireCareRecipientAccess → service →
auditService.logAction`.

### Phase 4 — Backend: data domain schema and read endpoints

Goal: land the canonical tables and the **read** endpoints the dashboard
already needs. No write pipelines (HealthKit ingest, baseline compute, AI
generation, alert engine) in this phase — those each get their own phase
below so we can ship and audit them independently.

Add new tables and endpoints (all additive — no breaking changes):

| Domain | Table(s) | New endpoints |
| --- | --- | --- |
| Observations | `health_observations` | `GET /care-recipients/:id/observations` |
| Baselines | `metric_baselines` | `GET /care-recipients/:id/baselines` |
| AI summaries | `ai_summaries` | `GET /care-recipients/:id/summaries` |
| Alerts | `alerts` | `GET /care-recipients/:id/alerts`, `GET /alerts` |
| Appointments | `appointments` | `GET /care-recipients/:id/appointments` |
| Action plans | `action_plans`, `action_plan_items` | `GET /care-recipients/:id/action-plans` |
| Data sources registry | `care_recipient_data_sources` | `GET /care-recipients/:id/data-sources` |
| Epic OAuth | `epic_connections`, `epic_oauth_states` | SMART on FHIR endpoints |

Every endpoint: `requireCognitoUser` → `requireCareRecipientAccess` →
business logic → `auditService.logAction`. No PHI in `audit_logs.metadata`.
Every new domain: service + DAO + lib + unit test + integration test.

What this phase **does not** include:

- iOS HealthKit ingest path (Phase 4A).
- Baseline computation job (Phase 4B).
- AI summary generation pipeline (Phase 4B).
- Alert evaluation / rule engine (Phase 4B).

Until 4A and 4B land, all the new read endpoints return empty result sets
for real care recipients (no fabricated PHI). Web pages render the same
honest "no data yet" empty states they already render in Phase 3.

**Backend impact:** additive only. **Aptible deploy:** runs after tests pass.

### Phase 4A — iOS HealthKit sync to backend

Goal: turn the iOS app into a **HealthKit sync companion** that feeds
`health_observations`. The web app remains the only caregiver UI; iOS
is wire only.

End-to-end data flow (the missing MVP path):

1. User signs into iOS (existing Cognito Hosted UI flow).
2. iOS requests HealthKit permissions for the supported metric set.
3. iOS reads supported HealthKit samples since `last_synced_at`.
4. iOS normalizes each sample into the shared **observation contract**
   (one row per sample, not raw HealthKit payload dumps).
5. iOS `POST`s a batch of normalized observations to the backend.
6. Backend verifies the Cognito JWT.
7. Backend calls `requireCareRecipientAccess(userId, careRecipientId,
   "write_observations")`.
8. Backend inserts rows into `health_observations` with
   `ON CONFLICT (source_type, source_record_id) DO NOTHING`
   for idempotent re-sync.
9. Backend updates `care_recipient_data_sources` row for
   `source_type = "healthkit"` (`status`, `last_synced_at`,
   `error_message NULL`).
10. Phase 4B nightly job recomputes `metric_baselines` from
    `health_observations`.
11. Phase 4B AI pipeline reads `health_observations` + `metric_baselines`
    (never raw HealthKit) to generate `ai_summaries` and evaluate alerts.
12. Web dashboard reads `GET /care-recipients/:id/observations`,
    `…/baselines`, `…/summaries`, `…/alerts` — Phase 3 read paths and
    adapters now return real values.

#### Supported HealthKit metrics (first version)

`steps`, `resting_heart_rate`, `hrv`, `sleep_duration`, `spo2`,
`respiratory_rate`, `walking_steadiness`, `fall_event`. Each maps to a
fixed `metric_type` string and a fixed `unit` so the read path never has
to interpret iOS-side enums.

#### Shared observation contract

Authored once in `shared/contracts/healthObservation.schema.json` and
mirrored as `shared/models/HealthObservation.{js,ts}` and an iOS
`Codable` struct, so backend, web, and iOS can never drift:

```json
{
  "careRecipientId": "uuid",
  "sourceType": "healthkit",
  "sourceRecordId": "string (HealthKit sample UUID or deterministic dedupe key)",
  "metricType": "steps | resting_heart_rate | hrv | sleep_duration | spo2 | respiratory_rate | walking_steadiness | fall_event",
  "value": 123,
  "unit": "count | bpm | ms | hours | percent | breaths_per_min | score | event",
  "measuredAt": "ISO timestamp",
  "startAt": "ISO timestamp (optional, range samples)",
  "endAt": "ISO timestamp (optional, range samples)",
  "metadata": {}
}
```

`metadata` is non-PHI structured extensions only (e.g.
`{ "device": "AppleWatch", "motionContext": "active" }`) — never raw
HealthKit payloads, never free-text notes.

#### Backend endpoints

Naming follows the existing backend convention (no `/api/` prefix; see
the existing `POST /health-data` route). The Next.js web app does not
proxy these — only iOS calls them.

- `POST /healthkit/sync` — accepts `{ careRecipientId, observations[] }`.
  Returns `{ accepted, deduped, rejected, lastSyncedAt }` with **counts
  only**, no echoed PHI.
- `GET /healthkit/status?careRecipientId=…` — returns the registry row
  for `source_type = "healthkit"`: `{ status, lastSyncedAt, errorMessage
  }`. Drives the iOS "last synced" UI and the web Data Sources card.

Both endpoints:
- Require a verified Cognito JWT.
- Call `requireCareRecipientAccess(userId, careRecipientId,
  "write_observations" | "read_data_sources")`.
- Audit success / failure with **counts only** (`accepted`, `deduped`,
  `rejected`) — never metric values, never `source_record_id`s, never
  raw payloads.
- Return generic, caregiver-safe error messages.

#### Idempotency and dedupe

Unique index `(source_type, source_record_id)` on `health_observations`
makes resync safe. iOS may safely re-send the same sample window after a
crash, network loss, or app reinstall — the backend will accept new rows
and silently dedupe ones it already has. iOS persists `last_synced_at`
locally only as a hint; the **server-side `last_synced_at`** in
`care_recipient_data_sources` is the source of truth.

#### Legacy `POST /health-data` transition

The existing `POST /health-data` route (writes to `health_data`,
user-scoped, only steps / heart_rate / sleep) stays alive for backward
compatibility through Phase 4A. Once iOS ships the new sync path and
backfills any in-flight users, Phase 4B (or a small follow-up) can:
- mark `POST /health-data` deprecated in iOS,
- backfill historical `health_data` rows into `health_observations`
  with `source_type = "healthkit_legacy"`,
- remove the route in a later phase.

No data is dropped during the transition.

#### iOS scope in Phase 4A

ALLOWED iOS work in this phase:
- Wire HealthKit permission prompts and metric reads in
  `Services/HealthKitManager.swift`.
- Add a `Services/HealthKitSyncService.swift` that batches normalized
  observations and posts them via `Services/APIClient.swift` to the new
  backend endpoints.
- Replace `Models/HealthUploadPayload.swift` with the shared observation
  contract (or add a new model alongside it — the legacy struct stays
  until `POST /health-data` is removed).
- A minimal **sync-status surface only** — a single screen / row that
  shows: connection state, last sync time, manual "Sync now" button, and
  permission management. This is the only iOS UI that may grow in this
  phase.

EXPLICITLY NOT IN Phase 4A on iOS:
- Full iOS dashboard (no Care Hub expansion, no member detail rebuild).
- Care team management UI on iOS.
- AI summary UI on iOS — caregivers read summaries on web only.
- Epic / MyChart UI on iOS — Epic OAuth lives on web (Phase 6+).
- Alerts UI on iOS.
- Appointment management UI on iOS.

These iOS UI areas remain frozen per `.cursor/rules/ios-style.mdc`.

#### PHI / logging guardrails (Phase 4A)

- iOS: never log HealthKit sample values, sample UUIDs, or the request
  body of the sync POST. Log only `{ method, path, status, accepted,
  deduped, rejected }`.
- Backend: the route handler must follow the existing
  `console.error("[API healthkit-sync]", e)` shape — no `req.body` in
  logs, no observations in logs, no Cognito tokens in logs.
- `audit_logs.metadata` for sync events: `{ accepted, deduped, rejected,
  metricTypes: ["steps", "hrv", …] }` — counts and the **set of metric
  types** only. Never values, never timestamps of individual samples,
  never `source_record_id`s.

**Backend impact:** additive (new route + new tables, no change to
existing `/health-data`). **Aptible deploy:** runs after tests pass.
**iOS impact:** new service module + new sync-status screen only.

### Phase 4B — Baseline computation, AI summary, and alert generation

Goal: turn the data flowing in via Phase 4A into the caregiver-facing
signal the web dashboard already has slots for.

In scope:
- Nightly `metric_baselines` recompute job (per care recipient × metric
  × window): `p10`, `p50`, `p90`, `sample_count`. Reads
  `health_observations`; never blocks a read path.
- AI summary pipeline (`ai_summaries`): minimized **structured** input
  only — recent observations + current baselines, no raw HealthKit
  dumps, no raw FHIR. Conservative caregiver-safe wording per the
  AI safety rules. Prompts and responses never logged.
- Alert engine (`alerts`): rule-based first (anomaly thresholds against
  baselines, fall events, walking steadiness drops), AI-assisted second.
  Severity vocabulary: `routine` · `monitor` · `critical`.
- Vector store / embeddings: **NOT in this phase.** Schema preserves
  source traceability and time windows so embeddings can be added later
  for longitudinal retrieval (notes, summaries, visit docs) without a
  schema break.
- Multi-agent framework: **NOT in this phase.**

This phase depends on Phase 4A producing real `health_observations` rows
for at least one care recipient.

**Backend impact:** additive. **Aptible deploy:** runs after tests pass.

### Phase 5 — Web app deployment

Deploy `apps/web/` to a separate target (Vercel recommended, or a second
Aptible app `narthecare-web`). The root `Dockerfile` and `aptible.yml`
(backend) are **not changed**. A separate `apps/web/Dockerfile` and
`.github/workflows/web.yml` handle the web deploy.

---

## 4. File-by-file change list

### Phase 0 (this phase)

| Op | Path | Reason |
| --- | --- | --- |
| N | `docs/web-mvp-plan.md` | This document |
| M | `README.md` | Declare web-first; iOS = sync companion |
| M | `docs/repo-structure.md` | Reflect web-first platform roles |
| M | `.cursor/rules/narthecare-phase1-plan.mdc` | Reorder: web Care Hub before iOS polish; reduce iOS scope |
| M | `.cursor/rules/ios-style.mdc` | Add scope freeze note |
| M | `docs/prototype-analysis.md` | Add forward reference to this file |

### Phase 1 (next)

| Op | Path |
| --- | --- |
| N | `apps/web/package.json` |
| N | `apps/web/package-lock.json` |
| N | `apps/web/tsconfig.json` |
| N | `apps/web/next.config.js` |
| N | `apps/web/tailwind.config.ts` |
| N | `apps/web/postcss.config.js` |
| N | `apps/web/.gitignore` |
| N | `apps/web/app/globals.css` |
| N | `apps/web/app/layout.tsx` |
| N | `apps/web/app/page.tsx` |
| N | `apps/web/app/dashboard/page.tsx` |
| N | `apps/web/app/seniors/page.tsx` |
| N | `apps/web/app/seniors/[id]/page.tsx` |
| N | `apps/web/app/alerts/page.tsx` |
| N | `apps/web/app/appointments/page.tsx` |
| N | `apps/web/app/insights/page.tsx` |
| N | `apps/web/app/action-plans/page.tsx` |
| N | `apps/web/app/settings/page.tsx` |
| N | `apps/web/components/sidebar.tsx` |
| N | `apps/web/components/care-team-list.tsx` |
| N | `apps/web/components/data-sources-list.tsx` |
| N | `apps/web/components/data-freshness-badge.tsx` |
| N | `apps/web/components/senior-tabs.tsx` |
| N | `apps/web/components/sparkline.tsx` |
| N | `apps/web/components/vitals-legend.tsx` |
| N | `apps/web/components/ui/{card,badge,button,input,label,select,separator,switch,tabs,tooltip,avatar}.tsx` |
| N | `apps/web/lib/utils.ts` |
| N | `apps/web/lib/alert-rules.ts` |
| N | `apps/web/lib/mock-data.ts` |
| N | `apps/web/public/brand/narthecare-*.svg` |
| R→D | `apps/web/app/patients/[id]/profile/page.tsx` → redirect to `/seniors/[id]` |
| D | `apps/web/app/patients/[id]/profile/mock.ts` |
| M | `apps/web/README.md` |
| D | `apps/web/docs/patient-profile-stub.md` |
| N | `apps/web/docs/web-app.md` |

### Phase 2 (done)

| Op | Path |
| --- | --- |
| M | `apps/web/package.json` (add `iron-session`, `aws-jwt-verify`, `vitest`, `vite-tsconfig-paths`) |
| M | `apps/web/.env.example` (Cognito + `SESSION_COOKIE_SECRET` + dev bypass) |
| N | `apps/web/middleware.ts` |
| N | `apps/web/vitest.config.mts` |
| N | `apps/web/lib/auth/cognito-config.ts` |
| N | `apps/web/lib/auth/cognito-identity.ts` |
| N | `apps/web/lib/auth/dev-bypass.ts` |
| N | `apps/web/lib/auth/errors.ts` |
| N | `apps/web/lib/auth/session-cookie.ts` |
| N | `apps/web/lib/auth/session.ts` |
| N | `apps/web/lib/auth/__tests__/{cognito-config,cognito-identity,dev-bypass,errors,session-cookie}.test.ts` |
| N | `apps/web/services/cognitoService.ts` |
| N | `apps/web/services/sessionService.ts` |
| N | `apps/web/services/apiClient.ts` |
| N | `apps/web/services/index.ts` |
| N | `apps/web/app/(app)/layout.tsx` (sidebar shell, auth gate) |
| N | `apps/web/app/auth/sign-in/page.tsx` |
| N | `apps/web/app/auth/error/page.tsx` |
| N | `apps/web/app/api/auth/login/route.ts` |
| N | `apps/web/app/api/auth/callback/route.ts` |
| N | `apps/web/app/api/auth/logout/route.ts` |
| R | `apps/web/app/{dashboard,seniors,alerts,appointments,insights,action-plans,settings,patients}/` → `apps/web/app/(app)/<same>/` |
| M | `apps/web/app/layout.tsx` (minimal — sidebar moved to `(app)/layout.tsx`) |
| M | `apps/web/components/sidebar.tsx` (accepts `SessionUser`, real avatar + sign-out link) |
| M | `apps/web/app/(app)/settings/page.tsx` (Phase 2 TODO refresh) |
| M | `apps/web/README.md`, `apps/web/docs/web-app.md` |

### Phase 4A (iOS HealthKit sync to backend)

Shared contract (single source of truth — added once, mirrored everywhere):

| Op | Path | Reason |
| --- | --- | --- |
| N | `shared/contracts/healthObservation.schema.json` | JSON Schema for the normalized observation contract |
| N | `shared/models/HealthObservation.js` | Backend mirror (consumed by Express) |
| N | `shared/models/HealthObservation.ts` | Web mirror (consumed by Next.js) |

Backend (additive — does **not** touch existing `POST /health-data`):

| Op | Path | Reason |
| --- | --- | --- |
| M | `apps/backend/app.js` | Mount `POST /healthkit/sync` and `GET /healthkit/status` |
| N | `apps/backend/services/healthObservationService.js` | Validate access, normalize, hand to DAO, audit with counts only |
| N | `apps/backend/services/dao/healthObservationDao.js` | `INSERT … ON CONFLICT (source_type, source_record_id) DO NOTHING`, batch insert, status read |
| N | `apps/backend/services/dao/careRecipientDataSourceDao.js` | Upsert `care_recipient_data_sources` row for `source_type = "healthkit"` |
| N | `apps/backend/lib/health-observations.js` | Pure parsing / metric-type + unit validation against the shared contract |
| N | `apps/backend/lib/__tests__/health-observations.test.js` | Unit tests — contract validation, dedupe-key derivation, never-log guards |
| N | `apps/backend/test/healthkit-sync.integration.test.js` | Integration test — auth gate, access gate, idempotent re-sync, audit shape |
| N | `apps/backend/migrations/00XX_health_observations.sql` | `health_observations` + indexes (`care_recipient_id, metric_type, measured_at`), (`source_type, source_record_id` UNIQUE), (`created_at`) |
| N | `apps/backend/migrations/00XX_care_recipient_data_sources.sql` | Registry table for sync status |
| M | `apps/backend/services/index.js` | Export `healthObservationService` |

iOS (HealthKit sync companion only — no caregiver UI growth):

| Op | Path | Reason |
| --- | --- | --- |
| M | `apps/ios/NARTHECare/Services/HealthKitManager.swift` | Add reads for resting HR, HRV, sleep, SpO2, respiratory rate, walking steadiness, fall events; permission prompts for the new types |
| N | `apps/ios/NARTHECare/Services/HealthKitSyncService.swift` | Batch + dedupe + post normalized observations via `APIClient`; persist local `lastSyncedAt` hint |
| N | `apps/ios/NARTHECare/Models/HealthObservation.swift` | `Codable` mirror of the shared contract |
| M | `apps/ios/NARTHECare/Services/APIClient.swift` | Add `postHealthKitSync` and `getHealthKitStatus`; redact bodies from logs |
| N | `apps/ios/NARTHECare/Views/SyncStatusView.swift` | Minimal sync-status surface: connection, last sync time, "Sync now", permissions link |
| M | `apps/ios/NARTHECare/ContentView.swift` | Route post-login to `SyncStatusView` (not to dashboard / patient profile growth) |
| D-soft | `apps/ios/NARTHECare/Models/HealthUploadPayload.swift` | Keep alive while legacy `POST /health-data` ships; remove in the cleanup phase after 4B |

Web (no new write paths — Phase 3 read paths now return real data):

| Op | Path | Reason |
| --- | --- | --- |
| M | `apps/web/services/careRecipientService.ts` | Add `getObservations`, `getDataSources` callers (read-only) |
| N | `apps/web/app/api/data/care-recipients/[id]/observations/route.ts` | JSON proxy → backend `GET /care-recipients/:id/observations` |
| N | `apps/web/app/api/data/care-recipients/[id]/data-sources/route.ts` | JSON proxy → backend `GET /care-recipients/:id/data-sources` |
| M | `apps/web/components/data-sources-list.tsx` | Render real `lastSync` / `status` from registry instead of empty fallback |
| M | `apps/web/lib/adapters/careRecipientToSenior.ts` | Map `healthkit` registry row into the existing `DataSource` view model |

### Phases 3, 4B, 5

Phase 3 file list lives in its own PR. Phase 4B (baseline + AI + alerts)
and Phase 5 (web deploy) file lists will be expanded in the PR for each
phase.

---

## 5. Risks and constraints

### Aptible safety (non-negotiable)

- Root `Dockerfile` stays unchanged until Phase 4 adds a new `shared/` dir.
- No root `package.json`.
- `.dockerignore` keeps `apps/web/` excluded — verified in Phase 0.
- `GET /health` must remain unauthenticated, DB-free, and unlogged.
- `assertProductionAuthReady` in `lib/dev-auth.js` requires `COGNITO_*` in
  production — new web envs must not interfere with this.

### PHI

- Mock data treated as if real: gated, never logged, never shipped to Aptible.
- Web app: never log response body, JWT, Authorization header, or cookie value.
- JWT lives in httpOnly cookie only; never in `localStorage` or `NEXT_PUBLIC_*`.
- UUIDs only in URL paths/query strings — no identifying tokens in server logs.
- AI surface (`/insights`, `/action-plans`): summarize + evidence only.
  Never diagnose. Never prescribe. Keep "Ways To Support" framing.
- Audit every new Phase 4 endpoint; PHI never in `audit_logs.metadata`.

### Architectural

- Prototype `senior.id` strings (`"s-001"`) → replace with UUIDs in Phase 1
  mocks so route shape matches both worlds.
- New TS types live in `shared/models/`, mirrored by backend JS mirror.
  No contract drift allowed.
- No `apps/web/` → `apps/backend/` direct imports. HTTP + `shared/` only.
- Phase 2 auth: do not invent a second identity system. One Cognito user pool
  for both web and iOS. NextAuth wraps the same JWT the backend already
  verifies.

### Scope guards

- iOS: **no new caregiver UI screens** until web MVP ships. The one
  exception, scoped to Phase 4A, is a minimal sync-status surface
  (connection state, last sync time, "Sync now", permissions link) —
  nothing more.
- iOS Phase 4A is **allowed** to: extend `HealthKitManager` with new
  metric types, add `HealthKitSyncService`, add `Models/HealthObservation
  .swift`, and call new backend endpoints.
- iOS Phase 4A is **NOT allowed** to: rebuild Care Hub, expand patient
  profile, add care team management, add AI summary UI, add Epic UI, or
  add alert / appointment management UI. Those areas stay frozen per
  `.cursor/rules/ios-style.mdc`.
- iOS existing: legacy `POST /health-data` ingest path stays alive
  through Phase 4A; deprecation and historical backfill happen in a
  cleanup step after Phase 4B.
- Backend Phase 4A: `POST /healthkit/sync` and `GET /healthkit/status`
  must verify Cognito JWT and call `requireCareRecipientAccess` before
  any DB write or read. Idempotent inserts via `(source_type,
  source_record_id)` unique index. Audit logs carry **counts only** —
  never values, never `source_record_id`s, never raw payloads.
- AI scope guard (carried into Phase 4B): AI summaries read from
  `health_observations` + `metric_baselines`, **not** from raw HealthKit
  payloads. No vector store, no multi-agent framework in Phase 4B.
- Settings page Phase 1: disable the "Save" button visibly until
  `PATCH /api/me` exists on the backend.
- Do NOT copy: `Foundational Dashboard Code.js`, `mock-data Broken.ts`,
  `page.tsx.backup.tsx`.

---

## 6. Terminology reference

| Context | Term |
| --- | --- |
| Data contract / database | `care_recipient` / `CareRecipient` |
| UI copy (all surfaces) | Care Member |
| iOS (clinical register) | Care Recipient |
| Alert vocabulary | `routine` (good) · `monitor` · `critical` |
| Risk level (profile) | `low` · `moderate` · `high` |
| Dashboard overall status | `all_stable` · `needs_attention` · `critical` |
