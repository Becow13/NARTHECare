# API contract — `GET /care-recipients/:id/profile`

Surfaces the **Patient / Care Recipient Profile** consumed by the
SwiftUI `PatientProfileView` and the future web route
`/patients/:id/profile`.

> **Status: planned, not implemented.** The route, auth, and
> PostgreSQL persistence are all TODO. The iOS and web apps consume
> a local mock today. This doc is frozen so the implementation cannot
> drift from the shape both clients are already coded against.

---

## Request

```
GET /care-recipients/:id/profile
Authorization: Bearer <Cognito JWT>   ← TODO(cognito): not yet enforced
```

`:id` is a UUID v4 — no PHI in the path.

### Required headers (future)

| Header                      | Source                                       | Notes                                         |
| --------------------------- | -------------------------------------------- | --------------------------------------------- |
| `Authorization`             | Cognito access token                         | TODO(cognito): token refresh on 401           |
| `X-Device-Id`               | iOS Keychain-stored device id                | Feeds audit log `action=profile.read`         |

---

## Response — `200 OK`

**Body is an envelope** (`{ careRecipient: CareRecipientProfile }`) so
we can add sibling fields (e.g. `careRecipient`, `warnings`) without a
breaking change.

Shape is defined canonically in:

- [`shared/contracts/careRecipientProfile.schema.json`](../../shared/contracts/careRecipientProfile.schema.json) — JSON Schema draft 2020-12 (source of truth).
- [`shared/contracts/careRecipientProfile.example.json`](../../shared/contracts/careRecipientProfile.example.json) — canonical Margaret Chen example payload.
- `shared/models/CareRecipientProfile.ts` — hand-kept TS mirror.
- `shared/models/CareRecipientProfile.js` — hand-kept JS mirror.
- `apps/ios/NARTHECare/Models/CareRecipientProfile.swift` — hand-kept Swift mirror.

If any of those four mirrors diverge from the JSON Schema, the JSON
Schema wins.

### Field summary

| Field                             | Type                              | Notes                                                                  |
| --------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `id`                              | `uuid`                            | Matches `:id` in the URL.                                              |
| `name`                            | `string`                          | Display name. PHI — never logged.                                      |
| `age`                             | `integer` ≥ 0                     | Pre-computed server-side to avoid redundant DOB math in the UI.        |
| `dateOfBirth`                     | `YYYY-MM-DD`                      | ISO calendar date (not ISO-8601 datetime).                             |
| `gender`                          | `string?`                         | Free-text; optional.                                                   |
| `primaryConditions`               | `string[]`                        | Shown as chips.                                                        |
| `riskLevel`                       | `"low" \| "moderate" \| "high"`   | Drives `RiskBadge` color.                                              |
| `contact.phone`                   | `E.164 string?`                   | PHI.                                                                   |
| `contact.address`                 | `string?`                         | PHI.                                                                   |
| `emergencyContact.{name,phone}`   | `string`                          | Both required. PHI.                                                    |
| `emergencyContact.relationship`   | `string?`                         |                                                                        |
| `careTeam.primaryCaregiver`       | `string`                          | Display name of the member flagged primary.                            |
| `careTeam.members[]`              | `CareTeamMember[]`                | See enum values below.                                                 |
| `healthBackground.*`              | see schema                        | Conditions / allergies / medications arrays plus mobility + fall risk. |
| `dataSources[]`                   | `DataSource[]`                    | One row per integration family (unique by `type`).                     |
| `baseline.*`                      | see schema                        | Ranges (`min`/`max`) and BP baseline string.                           |
| `recentNotes[]`                   | `RecentNote[]`                    | PHI — clinician / caregiver notes.                                     |
| `lastUpdated`                     | `ISO-8601 datetime`               | Server's `updated_at` for the profile row.                             |

### Enum values (must match the JSON Schema exactly)

```
riskLevel           : low | moderate | high
dataSources[].type  : apple_health | epic | fitbit | garmin | ring | fall_detection
dataSources[].status: connected | not_connected | error
careTeam[].role     : primary_caregiver | family_member | clinician | care_coordinator
careTeam[].permission: full_access | limited_access | clinical_access | view_only
```

### Field-name convention

All JSON fields are **camelCase** and match the TS / Swift / JS mirrors
1:1 so no `CodingKeys` remapping or key translation is needed on any
client.

### Example

See [`shared/contracts/careRecipientProfile.example.json`](../../shared/contracts/careRecipientProfile.example.json).

---

## Error responses

| Status | When                                                   | Body                                         |
| ------ | ------------------------------------------------------ | -------------------------------------------- |
| `400`  | `:id` is not a UUID                                    | `{ "error": "id must be a UUID" }`           |
| `401`  | Missing / expired token                                | `{ "error": "Unauthenticated" }`             |
| `403`  | Caller has no RBAC permission for this care recipient  | `{ "error": "Forbidden" }`                   |
| `404`  | No row with this id                                    | `{ "error": "Not found" }`                   |
| `500`  | Anything else                                          | `{ "error": "Internal" }` — no internals leaked |

Errors never include the payload shape or PHI.

---

## Healthcare constraints (must-follow)

1. **No PHI in logs.** Log only the request outcome
   (`[API care-recipient-profile] 200 id=<uuid> actor=<uuid>`). Names,
   addresses, phone numbers, notes, and health data must not be
   logged.
2. **RBAC enforced server-side** (TODO: `lib/careRecipientAccess.js`).
   The iOS and web clients must render a friendly 403 screen, never
   fake access based on local state.
3. **Audit every read**
   (TODO: `lib/audit.js`:
   `{ userId, action: "careRecipientProfile.read", resourceId: id, ts }`).
4. **TLS in transit, encrypted at rest** (TODO: PostgreSQL column-level
   encryption for `contact`, `emergencyContact`, `recentNotes`).
5. **Tokens:** Cognito access token in an httpOnly cookie (web) or
   Keychain (iOS). Never `localStorage`. Never embed in URLs.
6. **MyChart / Epic:** fetched via SMART on FHIR at a separate endpoint
   — this profile route never proxies raw Epic data. TODO(fhir):
   `/care-recipients/:id/fhir-handshake`.

---

## Future extensions (do not add yet)

- `riskLevelReason` — explainability field populated by the AI
  summariser when `riskLevel` changes. Must come with evidence and a
  "not medical advice" disclaimer.
- `pendingConsent[]` — for SMART on FHIR handshakes the caregiver
  has not yet approved.
- `ETag` / `If-None-Match` — the profile changes slowly, caching is
  worthwhile once traffic is real.

All of these are out of scope for the current iOS build.
