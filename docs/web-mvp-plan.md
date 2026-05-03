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

### Phase 4 — Backend: data domain schema and read endpoints ✅

**Done.** Seven canonical care-recipient-scoped domains land with
idempotent migrations, layered service / DAO / pure-helper modules, and
the full read surface the Phase 3 dashboard adapters were already
shaped against. No write pipelines (HealthKit ingest, baseline compute,
AI generation, alert engine) in this phase — those each get their own
phase below so we can ship and audit them independently. Epic OAuth is
deliberately deferred to its own phase (Phase 6+ in this plan; items
8–9 in `narthecare-phase1-plan.mdc`) — Phase 4 is read-only and does
not own any external integration credentials.

Tables added (all `care_recipient_id UUID NOT NULL REFERENCES
care_recipients(id) ON DELETE CASCADE` + timestamps; full DDL in
`apps/backend/schema.sql`):

| Table | Notable indexes |
| --- | --- |
| `health_observations` | `(care_recipient_id, metric_type, observed_at DESC)`; partial UNIQUE `(source_type, source_record_id) WHERE source_record_id IS NOT NULL` for Phase 4A's `ON CONFLICT … DO NOTHING` |
| `metric_baselines` | UNIQUE `(care_recipient_id, metric_type, window_days)` for the Phase 4B nightly recompute UPSERT |
| `ai_summaries` | `(care_recipient_id, summary_type, generated_at DESC)` |
| `alerts` | `(care_recipient_id, observed_at DESC)`, `(status, observed_at DESC)` for the cross-recipient feed |
| `appointments` | `(care_recipient_id, scheduled_for ASC)`; partial UNIQUE `(source_type, source_record_id)` for future Epic Encounter sync |
| `action_plans` + `action_plan_items` | `(care_recipient_id, status)`; items keyed `(action_plan_id, sort_order ASC)` |
| `care_recipient_data_sources` | UNIQUE `(care_recipient_id, source_type)` for Phase 4A's registry upsert |

Endpoints added (all additive — no breaking changes):

| Endpoint | Audit action | Notes |
| --- | --- | --- |
| `GET /care-recipients/:id/observations` | `LIST_HEALTH_OBSERVATIONS` | Filters: `metricType`, `since`, `limit` (capped at 1000) |
| `GET /care-recipients/:id/baselines` | `LIST_METRIC_BASELINES` | Filters: `metricType`, `windowDays` (7 / 14 / 30) |
| `GET /care-recipients/:id/summaries` | `LIST_AI_SUMMARIES` | Filters: `type` (`daily`/`anomaly`/`post_visit`), `limit` |
| `GET /care-recipients/:id/alerts` | `LIST_ALERTS` | Filters: `severity`, `status`, `limit` |
| `GET /alerts` | `LIST_ALERTS_ACROSS_RECIPIENTS` | Cross-recipient feed; service derives the user's accessible care_recipient_ids from `care_team_members` and short-circuits when the user has none |
| `GET /care-recipients/:id/appointments` | `LIST_APPOINTMENTS` | Filters: `status`, `window` (`upcoming` / `past` / `all`); SQL anchors "now" to the server clock |
| `GET /care-recipients/:id/action-plans` | `LIST_ACTION_PLANS` | Two round-trips by design — items are loaded only when at least one plan exists, so the no-plans path stays single-query |
| `GET /care-recipients/:id/data-sources` | `LIST_DATA_SOURCES` | Filters: `type`, `status`; constants re-exported from `shared/models/CareRecipientProfile.js` so the registry never drifts from the dashboard view model |

Every per-recipient endpoint chains
`requireCognitoUser → _isUuid(:id) → requireCareRecipientAccess →
service.parseListQuery → service.fetchForRecipient →
auditService.logAction`. The 403 path collapses "not on the care team"
and "recipient does not exist" into the same response so existence is
not leaked, mirroring the Phase 3 `GET /care-recipients/:id` shape.
The cross-recipient `/alerts` route writes a single audit row with
`resource_id = null` and `metadata = { count }`.

Audit safety:

- `audit_logs.metadata` carries `{ count }` only — never metric values,
  summary text, alert titles, observation timestamps, source record
  ids, or any other PHI.
- Route handlers tag logs `console.error("[API <route>]", e)` and never
  log `req.body`, `req.query`, or response payloads.
- Service modules are pure of HTTP concerns — `requireCareRecipientAccess`
  is the only authorization check and lives at the route layer so a
  background job can reuse the service without re-deriving RBAC.

What this phase **does not** include:

- iOS HealthKit ingest path (Phase 4A).
- Baseline computation job (Phase 4B).
- AI summary generation pipeline (Phase 4B).
- Alert evaluation / rule engine (Phase 4B).
- Epic OAuth / SMART on FHIR / `epic_connections` /
  `epic_oauth_states` (Phase 6+).

Until 4A and 4B land, all the new read endpoints return empty result
sets for real care recipients (no fabricated PHI). Web pages render the
same honest "no data yet" empty states they already render in Phase 3.

Tests: 76 new tests. 55 unit tests across `apps/backend/lib/__tests__/
{health-observations,metric-baselines,ai-summaries,alerts,appointments,
action-plans,data-sources}.test.js` (parsing + frozen-enum guards).
21 integration tests in `apps/backend/test/phase4-reads.integration.
test.js` cover access gates, query-parse failures, audit shape, and
end-to-end newest-first / filter behavior with seeded fake-pool rows.
Full suite: 179 passing.

**Backend impact:** additive only. **Aptible deploy:** runs after tests pass.

### Phase 4A — iOS HealthKit sync to backend ✅

**Done.** The HealthKit sync companion is now end-to-end. iOS reads
the eight Phase 4A metrics, normalizes each sample into the shared
`HealthObservation` contract, posts batches to the authenticated
`POST /healthkit/sync` route, and the backend persists them with
idempotent dedupe. The web dashboard reads the same registry rows
through new `/api/data/care-recipients/:id/{observations,data-sources}`
proxies — Phase 3's "honest empty state" Data Sources card now
renders real `lastSyncedAt` for any recipient who has synced once.

What landed (vs the design below):

- **Shared contract:**
  - `shared/contracts/healthObservation.schema.json` (source of truth).
  - `shared/models/HealthObservation.{js,ts}` mirrors + Swift
    `apps/ios/NARTHECare/Models/HealthObservation.swift`.
  - `unit` is constrained per `metricType` via
    `HEALTH_OBSERVATION_UNIT_BY_METRIC_TYPE`; the backend rejects
    mismatches with a 400 before any DB write.
- **Backend writes:**
  - `POST /healthkit/sync` and `GET /healthkit/status?careRecipientId=…`
    follow the existing convention (no `/api/` prefix).
  - Both verify Cognito + `requireCareRecipientAccess` before any DB
    work. Dedupe is enforced by the partial UNIQUE
    `(source_type, source_record_id) WHERE source_record_id IS NOT NULL`
    via `INSERT … ON CONFLICT DO NOTHING`.
  - Registry upsert collapses HealthKit success into one row per
    `(care_recipient_id, source_type='healthkit')`. A failed sync
    flips `status='error'` with a generic, PHI-free
    `error_message`; recovery clears it.
  - Audit metadata is `{ accepted, deduped, rejected, metricTypes }`
    only — no values, no source_record_ids, no per-sample timestamps.
    A separate `VIEW_HEALTHKIT_STATUS` audit row covers the read path.
- **iOS sync companion:**
  - `HealthKitManager.readObservations(since:)` reads steps, resting
    HR, HRV, SpO2, sleep duration, respiratory rate, walking
    steadiness, and fall events. Daily aggregates (steps,
    sleep, falls) carry deterministic `metric:YYYY-MM-DD`
    `sourceRecordId`s so resyncs collapse instead of duplicating
    per-day buckets.
  - `HealthKitSyncService` is the single seam — it enforces
    HealthKit availability, requests authorization, reads
    observations since the in-memory high watermark, and posts the
    batch with the caregiver's Cognito ID token.
  - `SyncStatusView` is the minimal sync-status surface (recipient
    picker, registry status, last sync, "Sync now", "Manage HealthKit
    access"). `ContentView` routes post-login here; the legacy Care
    Hub + mock patient profile remain reachable from the Developer
    Tools sheet so existing fixtures don't bit-rot.
- **Web reads:**
  - `services/careRecipientService.ts` adds `listObservations` and
    `listDataSources` callers.
  - JSON proxies under `/api/data/care-recipients/:id/observations`
    and `/api/data/care-recipients/:id/data-sources` follow the
    Phase 3 convention (refresh-safe, 403 collapsed into 404).
  - `lib/adapters/careRecipientToSenior.ts` maps the registry-only
    `healthkit` transport to the existing "Apple Health" view model
    so the dashboard contract is unchanged.
- **Schema vs registry source-type vocabulary** — kept the
  dashboard `DataSource` enum intentionally narrow
  (`apple_health`, `epic`, `fitbit`, `garmin`, `ring`,
  `fall_detection`). The registry stores `healthkit` as a
  transport identifier; the adapter is the only place that
  collapses both onto the same UI card. Phase 4B can lift the
  distinction if/when the registry vocabulary widens.

PHI / security guardrails verified:

- Apps logs include only method + path + status. Body bytes are
  never logged on iOS, the web proxies, the apiClient, or the
  backend route handlers. Tokens never reach `localStorage` or
  `console.log`.
- The web service surface drops backend response bodies on non-2xx
  before rethrowing — the adapter's view never sees a server message
  that could carry caregiver-safe error copy.
- iOS never persists tokens or PHI to disk; `localLastSync` is a
  process-local hint and the server's `last_synced_at` is the
  source of truth.

Tests: 32 new tests. 24 unit tests on the new
`parseSyncRequestBody` + `distinctMetricTypes` helpers in
`apps/backend/lib/__tests__/health-observations.test.js`. 12
integration tests in `apps/backend/test/healthkit-sync.integration.test.js`
cover auth, access gates, contract-broken payloads, dedupe across
re-syncs, registry upsert, and audit shape. 7 web adapter tests in
`apps/web/lib/adapters/__tests__/careRecipientToSenior.test.ts`
cover registry → view-model mapping. **Backend full suite: 210
passing. Web full suite: 63 passing.**

What this phase does **not** include:

- Baseline computation, AI summary generation, alert engine — Phase 4B.
- Epic OAuth / SMART on FHIR — Phase 6+.
- Removal of the legacy `POST /health-data` route (kept alive
  alongside the new sync path; the deprecation + back-fill happens
  after Phase 4B).
- Background HealthKit observers on iOS. Phase 4A ships the
  manual "Sync now" path only; Phase 4B can wire
  `HKObserverQuery` against the same `HealthKitSyncService`.

**Backend impact:** additive only. **Aptible deploy:** runs after
tests pass.

#### Original Phase 4A design (kept for traceability)

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

### Phase 4B — Baseline computation, AI summary, and alert generation ✅

**Done.** Three nightly background-job pipelines now turn the
Phase 4A `health_observations` flow into the caregiver-facing signal
the web dashboard already has slots for: rolling baseline recompute,
rule-based alert engine, and a deterministic template-based AI summary
generator. Each pipeline is a standalone Node script invoked by an
external scheduler (Aptible Cron) — no in-process scheduler, no
LLM round-trip, no new HTTP routes. The Phase 4 read endpoints land
on real rows the moment the jobs run.

What landed (vs the "in scope" list below):

- **Pillar 1 — Baseline recompute (`metric_baselines`):**
  - Pure percentile + windowing helpers (`apps/backend/lib/baseline-stats.js`):
    linear-interpolation `p10 / p50 / p90` (PERCENTILE.INC), the frozen
    `BASELINE_METRIC_TYPES` set (excludes `fall_event` — binary signal,
    no percentile), and `windowStartIso(now, days)` for deterministic
    window math. `MIN_SAMPLES_FOR_PERCENTILES = 5` gates percentile
    population so a thin sample never produces a misleadingly tight
    baseline that the alert engine would trip on.
  - DAO (`services/dao/metricBaselineDao.upsertBaseline`):
    `INSERT … ON CONFLICT (recipient, metric, window) DO UPDATE` keyed
    on the existing partial UNIQUE so reruns refresh in place.
  - DAO (`services/dao/healthObservationDao.fetchObservationValuesInWindow`):
    full-window value scan returning a bare number array — keeps the
    per-recipient memory footprint tight even for 30-day windows of
    continuous samples.
  - Service (`services/metricBaselineService.recomputeBaselinesForRecipient`,
    `…ForAllRecipients`): sweeps every recipient × every
    `BASELINE_METRIC_TYPES` × every `BASELINE_WINDOWS` (7/14/30) =
    21 baseline rows per recipient. Per-recipient errors surface
    through `errors[]` and the sweep continues.
- **Pillar 2 — Alert engine (`alerts`):**
  - Pure rule definitions (`apps/backend/lib/alert-rules.js`): every
    fall event → `critical`; resting-HR / HRV / SpO2 vs 14-day
    baseline → `monitor` (with SpO2 < `SPO2_CRITICAL_THRESHOLD = 92`
    escalating to `critical` even without a baseline); walking
    steadiness 7-day p50 below 30-day p10 → `monitor`. Every alert
    candidate carries a deterministic `source_record_id` (day-bucket
    for threshold rules, source observation id for fall events) so
    `INSERT … ON CONFLICT DO NOTHING` collapses repeat runs.
  - DAO (`services/dao/alertDao.insertAlerts` + new partial UNIQUE
    `(source_type, source_record_id) WHERE source_record_id IS NOT NULL`):
    batched insert in a single transaction, mirrors the Phase 4A
    health-observation ingest pattern. Mirrored in `schema.sql`.
  - Service (`services/alertService.evaluateAlertsForRecipient`,
    `…ForAllRecipients`): pulls 7 days of observations + every
    baseline for the recipient, hands them to `evaluateAlertRules`,
    persists the candidates.
  - **AI-assisted alert scoring is NOT in this drop** — the rule
    engine is the foundation; an LLM-assisted layer can attach to
    the same `evaluateAlertRules` shape later (see "Deferred
    sub-pieces" below).
- **Pillar 3 — AI summary generation (`ai_summaries`):**
  - Pure input shaper (`apps/backend/lib/ai-summary-input.js`):
    collapses recent observations + current baselines into a
    minimized `StructuredSummaryInput` envelope (no raw HealthKit
    dumps, no raw FHIR, no free-text). Per metric: `latest`,
    `baseline`, classified `deviation` (`high` | `low` | `in_range`
    | `unknown`). Fall events surface as a count only — never as
    per-event ids in the input envelope.
  - Deterministic template generator
    (`apps/backend/lib/ai-summary-template.js`): renders conservative
    caregiver-safe sentences from the structured input. Stable
    `model = "narthecare-template-1"` and `prompt_version =
    "template-v1"` so a future regression in copy ties back to the
    generator that produced it. Wording rules verified by tests
    (no diagnostic verbs, no emergency instructions, "Consider …"
    framing, "not a medical diagnosis" disclaimer always appended).
  - DAO (`services/dao/aiSummaryDao.insertSummary`):
    `INSERT … RETURNING` so the service echoes the persisted id +
    `generated_at` back without a follow-up SELECT.
  - Service (`services/aiSummaryService.generateDailySummaryForRecipient`,
    `…ForAllRecipients`): generator selected via DI (defaults to
    template). The service NEVER logs `summary_text` or `evidence`,
    only the count + generator-identity surface.
- **Background-job runtime + entry points:**
  - Shared `apps/backend/scripts/_job-runtime.runJob(name, work)`
    handles the boot sequence (env, production-auth gates, pool
    create, drain, exit code). Exit codes: `0` clean, `1` fatal,
    `2` per-recipient errors surfaced.
  - `scripts/recompute-baselines.js`, `scripts/evaluate-alerts.js`,
    `scripts/generate-daily-summaries.js` — each ~5 lines on top of
    the shared runtime. `package.json` exposes `npm run
    job:recompute-baselines` / `job:evaluate-alerts` /
    `job:generate-daily-summaries` so local dev mirrors the Aptible
    Cron command shape.
  - **Recommended cron order:** baselines → alerts → summaries.
    Each job is idempotent independently, so Aptible can run them
    on independent schedules; running them in this order on the same
    night gives the freshest signal to the summary.
- **Audit:**
  - `lib/audit.js` adds `RECOMPUTE_METRIC_BASELINES`,
    `EVALUATE_ALERTS`, `GENERATE_AI_SUMMARY`. Job audit rows have
    `actor_user_id = null`, `resource_id = care_recipient_id`,
    `metadata = { counts + categories / generator-identity only }`.
  - Verified by integration tests: `audit_logs.metadata` never
    contains percentile values, summary text, alert titles,
    explanations, evidence ids, or per-row `source_record_id`s.

Deferred sub-pieces (intentionally NOT in this drop):

- **Anthropic-backed summary generator.** The plan requires
  conservative caregiver-safe wording from structured input — the
  template generator satisfies that today with no LLM round-trip,
  no API key, and no risk of model output landing in a log line.
  An Anthropic adapter can swap in via the existing DI seam once a
  no-PHI-in-logs transport, timeout / retry policy, and
  `ANTHROPIC_API_KEY` provisioning land.
- **AI-assisted alert scoring.** Rule-based first, AI-assisted
  second per the plan — the engine's `evaluateAlertRules` shape
  accepts the same `{ observations, baselines, now }` envelope a
  future scorer would consume.
- **Vector store / embeddings.** Out of scope per the plan; no
  schema columns added.
- **Multi-agent framework.** Out of scope per the plan.

PHI / security guardrails verified:

- App logs include only `[jobs <name>]` framing + count envelopes
  (recipient ids, counts, generator identities). Never PHI.
- Service modules never `console.log` an observation row, baseline
  row, alert row, or summary row body.
- The structured AI summary input IS PHI by design — it lives only
  in the function call between `buildStructuredSummaryInput` and the
  generator, and never reaches `audit_logs.metadata` or any
  `console.log`.
- Job entry points re-run `assertProductionAuthReady` /
  `assertDevAuthBypassAllowed` so a misconfigured cron host fails
  loudly instead of writing to a prod DB without the right auth
  posture.

Tests: 70 new tests (15 baseline-stats + 19 alert-rules + 12
ai-summary-input + 12 ai-summary-template + 12 phase4b-jobs
integration). **Backend full suite: 280 passing.**

This phase still depends on Phase 4A producing real `health_observations`
rows for at least one care recipient. Until a recipient has data, every
job sweeps cleanly, writes empty-state baseline rows, fires zero alerts,
and writes "no new readings" summaries.

**Backend impact:** additive (new tables already shipped in Phase 4 —
this phase only adds write paths + indexes for the alert dedupe).
**Aptible deploy:** runs after tests pass; cron jobs need to be
scheduled separately from the API deploy.

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

### Phase 4 (done — backend read surface)

Pure helpers (one per domain — no I/O):

| Op | Path |
| --- | --- |
| N | `apps/backend/lib/health-observations.js` |
| N | `apps/backend/lib/metric-baselines.js` |
| N | `apps/backend/lib/ai-summaries.js` |
| N | `apps/backend/lib/alerts.js` |
| N | `apps/backend/lib/appointments.js` |
| N | `apps/backend/lib/action-plans.js` |
| N | `apps/backend/lib/data-sources.js` |
| N | `apps/backend/lib/__tests__/{health-observations,metric-baselines,ai-summaries,alerts,appointments,action-plans,data-sources}.test.js` |

Services + DAOs:

| Op | Path |
| --- | --- |
| N | `apps/backend/services/healthObservationService.js` |
| N | `apps/backend/services/metricBaselineService.js` |
| N | `apps/backend/services/aiSummaryService.js` |
| N | `apps/backend/services/alertService.js` |
| N | `apps/backend/services/appointmentService.js` |
| N | `apps/backend/services/actionPlanService.js` |
| N | `apps/backend/services/careRecipientDataSourceService.js` |
| N | `apps/backend/services/dao/healthObservationDao.js` |
| N | `apps/backend/services/dao/metricBaselineDao.js` |
| N | `apps/backend/services/dao/aiSummaryDao.js` |
| N | `apps/backend/services/dao/alertDao.js` |
| N | `apps/backend/services/dao/appointmentDao.js` |
| N | `apps/backend/services/dao/actionPlanDao.js` |
| N | `apps/backend/services/dao/careRecipientDataSourceDao.js` |

Wiring:

| Op | Path |
| --- | --- |
| M | `apps/backend/app.js` (eight new route handlers — seven per-recipient + cross-recipient `/alerts`) |
| M | `apps/backend/server.js` (`ensureSchema` chain extended for the seven new tables) |
| M | `apps/backend/services/index.js` (export the seven new services) |
| M | `apps/backend/lib/audit.js` (`AUDIT_ACTIONS.list*` + `AUDIT_RESOURCE_TYPES.*` for each domain) |
| M | `apps/backend/schema.sql` (CREATE TABLE / index DDL for all seven tables — mirrors the DAO migrations) |
| N | `apps/backend/test/phase4-reads.integration.test.js` (route-layer end-to-end coverage) |

`apps/backend/services/dao/healthObservationDao.js` and
`apps/backend/services/dao/careRecipientDataSourceDao.js` already
ship the schema-defining UNIQUE indexes Phase 4A's `ON CONFLICT`
relies on — Phase 4A only adds the write paths, not the indexes.

### Phase 4A (iOS HealthKit sync to backend)

> **Note:** the rows tagged `N` in the table below for
> `apps/backend/services/healthObservationService.js`,
> `apps/backend/services/dao/healthObservationDao.js`,
> `apps/backend/services/dao/careRecipientDataSourceDao.js`,
> `apps/backend/lib/health-observations.js`, and
> `apps/backend/lib/__tests__/health-observations.test.js` already
> shipped in Phase 4 (read surface). Phase 4A modifies them with the
> write path (POST handlers, `INSERT … ON CONFLICT`, registry upsert) —
> treat those rows as `M`.

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

### Phase 4B (done — nightly jobs: baseline / alert / AI summary)

> **Note:** the rows tagged `M` for the existing
> `services/{metricBaselineService,alertService,aiSummaryService}.js`,
> `services/dao/{metricBaselineDao,alertDao,aiSummaryDao,
> healthObservationDao,careRecipientDao}.js`, and the existing
> `lib/audit.js` already shipped (read surface) in Phase 4. Phase 4B
> extends them with the write paths (UPSERT / batched INSERT / RETURNING),
> the new partial UNIQUE for alert dedupe, the three new audit-action
> constants, and the new background-job entry points + their `npm`
> scripts.

Pure helpers (one per pillar — no I/O):

| Op | Path |
| --- | --- |
| N | `apps/backend/lib/baseline-stats.js` |
| N | `apps/backend/lib/alert-rules.js` |
| N | `apps/backend/lib/ai-summary-input.js` |
| N | `apps/backend/lib/ai-summary-template.js` |
| N | `apps/backend/lib/__tests__/{baseline-stats,alert-rules,ai-summary-input,ai-summary-template}.test.js` |

Services + DAOs (write paths added to existing read-side modules):

| Op | Path |
| --- | --- |
| M | `apps/backend/services/metricBaselineService.js` (`recomputeBaselinesForRecipient`, `recomputeBaselinesForAllRecipients`, audit hookup) |
| M | `apps/backend/services/alertService.js` (`evaluateAlertsForRecipient`, `evaluateAlertsForAllRecipients`, audit hookup) |
| M | `apps/backend/services/aiSummaryService.js` (`generateDailySummaryForRecipient`, `generateDailySummariesForAllRecipients`, DI generator, audit hookup) |
| M | `apps/backend/services/dao/metricBaselineDao.js` (`upsertBaseline`) |
| M | `apps/backend/services/dao/alertDao.js` (`insertAlerts` + new partial UNIQUE on `(source_type, source_record_id)`) |
| M | `apps/backend/services/dao/aiSummaryDao.js` (`insertSummary`) |
| M | `apps/backend/services/dao/healthObservationDao.js` (`fetchObservationValuesInWindow`) |
| M | `apps/backend/services/dao/careRecipientDao.js` (`fetchAllCareRecipientIds`) |

Background-job runtime + entry points:

| Op | Path |
| --- | --- |
| N | `apps/backend/scripts/_job-runtime.js` (shared boot / drain / exit-code helper) |
| N | `apps/backend/scripts/recompute-baselines.js` |
| N | `apps/backend/scripts/evaluate-alerts.js` |
| N | `apps/backend/scripts/generate-daily-summaries.js` |
| M | `apps/backend/package.json` (three new `job:*` scripts) |

Wiring:

| Op | Path |
| --- | --- |
| M | `apps/backend/lib/audit.js` (`AUDIT_ACTIONS.recomputeMetricBaselines / generateAiSummary / evaluateAlerts`) |
| M | `apps/backend/schema.sql` (partial UNIQUE `alerts_source_record_uidx`) |
| N | `apps/backend/test/phase4b-jobs.integration.test.js` (end-to-end coverage of all three pipelines) |

### Phases 3, 5

Phase 3 file list lives in its own PR. Phase 5 (web deploy) file list
will be expanded in the PR for that phase.

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
