# Patient Profile — Web Stub

This doc describes how the future **web** Patient Profile page must map
onto the same data contract the iOS app uses. There is **no runnable
Next.js app here yet**. Do not build one before reading this file, the
shared schema, and the API contract.

## Target route

```
/patients/:id/profile
```

`:id` is a UUID — keep it a UUID in the URL so no PHI leaks into
server access logs. The same id is used by the iOS app and by
`GET /care-recipients/:id/profile`.

## Data flow (planned)

```
Browser                    apps/web (Next.js server)              Backend API
   │                            │                                     │
   │ GET /patients/:id/profile  │                                     │
   │───────────────────────────►│                                     │
   │                            │ GET /care-recipients/:id/profile    │
   │                            │ Authorization: Bearer <jwt>         │
   │                            │────────────────────────────────────►│
   │                            │◄────────── CareRecipientProfile ────│
   │◄── React-rendered page ────│                                     │
```

The response JSON matches
[`shared/contracts/careRecipientProfile.schema.json`](../../../shared/contracts/careRecipientProfile.schema.json)
exactly. The server-side React component imports the TS type from
`shared/models/CareRecipientProfile.ts` — **never** redeclare the
shape inside `apps/web/`.

## Current state

```
apps/web/
  README.md                                  This folder's README
  docs/
    patient-profile-stub.md                  ← this file
  app/
    patients/[id]/profile/
      page.tsx                               Stub React component (not wired into a Next.js app yet)
      mock.ts                                Local fallback matching the shared example payload
```

There is no `package.json`, no `tsconfig.json`, no Tailwind config. The
`page.tsx` is a preview of the intended route shape; it renders the
sections that the iOS `PatientProfileView` renders so a reviewer can
see the shape without spinning up a Next.js project.

## When a real Next.js app is added

Follow this checklist — each item maps to a healthcare rule the
`page.tsx` stub already documents in its header comment.

1. **Import types from `shared/models/`.**
   Do not copy/paste the shape into `apps/web/`. `CareRecipientProfile`
   is frozen in the shared schema + TS mirror.
2. **Fetch from the backend, not the mock.**
   Replace `import { margaretChen } from "./mock"` with a server-side
   fetch of `GET /care-recipients/:id/profile`. Delete the mock once
   the backend seeds profiles in every environment.
3. **Forward the Cognito JWT server-side.**
   Keep the token in an httpOnly cookie. Forward it as
   `Authorization: Bearer <token>` to the backend. Never expose it to
   the browser JS.
4. **Render a 403 screen when the backend returns 403.**
   Do not fake access based on client-side checks — RBAC lives on the
   server.
5. **Render a 404 via `notFound()` when the backend returns 404.**
6. **Do not log the response body.**
   It contains PHI (name, contact, notes, health background). Log only
   the response status and a sanitized id if needed for debugging.
7. **Match the caregiver dashboard prototype's visual language.**
   See `docs/prototype-analysis.md` for the palette (`#3B5BDB` accent,
   `emerald / amber / red` states, soft gray borders, `rounded-lg`
   cards). Import the exact hex values from the shared token list, or
   re-declare them once in the web Tailwind config — never reinvent.
8. **Port the iOS components 1:1.**
   Each SwiftUI component under `apps/ios/NARTHECare/Components/` has
   a web twin: `InfoCard` → `<section class="rounded-lg border bg-white p-5">`,
   `RiskBadge` → pill with emerald / amber / red variants,
   `StatusBadge` → generic tone pill,
   `DataSourceRow` → icon + name/last-sync + StatusBadge. Keep the
   rendering rule "every enum value has exactly one color + label" in
   a single shared map, mirroring the iOS `extension`s on each enum.

## Section mapping (web ↔ iOS ↔ schema)

| Section            | iOS view                              | Schema path                                  |
| ------------------ | ------------------------------------- | -------------------------------------------- |
| Header             | `ProfileHeaderCard`                   | `name`, `age`, `primaryConditions`, `riskLevel`, `lastUpdated` |
| Basic Information  | `BasicInformationCard`                | `name`, `dateOfBirth`, `gender`, `contact.*`, `emergencyContact.*` |
| Care Team          | `CareTeamCard`                        | `careTeam.primaryCaregiver`, `careTeam.members[]` |
| Health Background  | `HealthBackgroundCard`                | `healthBackground.*`                         |
| Connected Sources  | `DataSourcesCard` (`DataSourceRow`)   | `dataSources[]`                              |
| Baseline Summary   | `BaselineCard`                        | `baseline.*`                                 |
| Recent Notes       | `RecentNotesCard`                     | `recentNotes[]`                              |
| Actions            | `ActionButtons`                       | n/a — buttons only                            |

When a schema field moves or retypes, every column in a row has to
change in the **same commit**. This is the only way to keep the
iOS / web / backend mirrors honest without a codegen step yet.

## What NOT to build yet

- Real authentication (Cognito, OAuth).
- SMART on FHIR / MyChart OAuth handshake.
- Token refresh / session middleware.
- Any form that writes back to the profile (edit profile, add note,
  connect data source). The route is read-only today.
- Audit logging (will live on the backend, not the web server).

Add them as separate PRs once the backend route ships.
