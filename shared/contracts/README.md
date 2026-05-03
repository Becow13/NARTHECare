# shared/contracts

JSON Schema source-of-truth for every cross-platform payload in
NARTHECare.

| File                                    | Role                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| `careRecipientProfile.schema.json`      | JSON Schema (draft 2020-12) for `GET /care-recipients/:id/profile`.  |
| `careRecipientProfile.example.json`     | Canonical Margaret Chen example. Must validate against the schema.   |
| `healthObservation.schema.json`         | JSON Schema (draft 2020-12) for the per-sample payload of `POST /healthkit/sync`. |

## Why a JSON Schema is the source of truth

Three clients consume this payload today:

1. **iOS (Swift)** — `apps/ios/NARTHECare/Models/CareRecipientProfile.swift`
2. **Web (TypeScript)** — `shared/models/CareRecipientProfile.ts`
3. **Backend (Node ESM)** — `shared/models/CareRecipientProfile.js`

Each of those files is a hand-kept **mirror** of this schema. The
schema wins on every conflict. When we add a codegen step (typeshare /
quicktype / json-schema-to-typescript), the mirrors will be regenerated
from this file.

## Rules

- **No schema drift.** If you add, rename, or retype a field in any
  mirror, update this schema and the other two mirrors in the same
  change.
- **Field names are camelCase.** Matches the JSON payload so no
  `CodingKeys` remapping is needed on iOS and no key translation is
  needed on the backend.
- **Enum values are snake_case.** e.g. `apple_health`, `primary_caregiver`.
  This matches the prototype's existing naming and avoids the Swift
  `CaseIterable` name-clash (`primary` / `clinical` already mean
  something else).
- **Never log PHI.** `name`, `contact.*`, `emergencyContact.*`,
  `healthBackground.*`, `recentNotes[].content` — all PHI. The schema
  does not enforce this, the server does.

## Future additions

New payloads (e.g. `ActionPlan`, `Alert`) will land as siblings of
`careRecipientProfile.schema.json` with their own example files. The
same lockstep-mirror rule applies.
