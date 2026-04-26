# shared/models

Cross-platform data contracts for NARTHECare. Co-located with
`shared/contracts/` (JSON Schema source of truth) so every shared
asset lives under one roof.

Each contract ships in **two hand-kept mirrors** so every platform can
import a shape in its native form:

| File | Consumed by | Why |
|---|---|---|
| `CareRecipientProfile.ts` | web (`apps/web/`) and any future TS code | Structural types + exported unions |
| `CareRecipientProfile.js` | backend (Node ESM) | Runtime enum constants + JSDoc `@typedef`s for editor tooling |
| `apps/ios/NARTHECare/Models/CareRecipientProfile.swift` | iOS app | `Codable, Sendable` structs matching the JSON payload |

## Rule: change all three together

If you add, rename, or retype a field in any mirror, you **must** update
the other two in the same change. CI reviewers should reject PRs that
only touch one file.

Field naming is camelCase across all three (matches the JSON payload),
so no `CodingKeys` remapping is needed on the iOS side and no
server-side key translation is needed on the backend.

## TODO — converge on a single source

When the backend moves to TypeScript (or when we adopt a codegen step
like typeshare / quicktype), the JS mirror and the Swift model should be
generated from the `.ts` file so drift becomes impossible.
