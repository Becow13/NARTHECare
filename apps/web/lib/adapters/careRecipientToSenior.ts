/**
 * Adapters: backend `CareRecipient*` payloads → web `Senior`-shaped
 * view models.
 *
 * The web pages were written against the prototype's rich `Senior`
 * view model (`lib/mock-data.ts`). The backend currently returns a
 * deliberately thinner shape — the list endpoint only has name + DOB
 * + primary condition, and the profile contract has no alerts /
 * observations / summaries (those are Phase 4 tables). This module
 * bridges the two WITHOUT fabricating fields the backend does not
 * know: unknown fields are rendered as safe defaults (empty arrays,
 * `null`, neutral `"routine"` status) so the UI can degrade
 * gracefully instead of inventing PHI.
 *
 * Constraints (healthcare):
 *   - Pure module, no I/O. Safe to import from Server Components,
 *     unit tests, and Phase 4 enrichment code alike.
 *   - Never throws on missing fields — a half-populated row must
 *     still render something reasonable. A thrown adapter error
 *     would hide access-control failures by masking them as 500s.
 *   - Never logs. The caller decides what, if anything, is safe to
 *     log. These inputs are PHI.
 *
 * Phase 4 will add: alerts, observations (vitals), ai_summaries,
 * action plans, appointments. When those arrive, extend this module
 * with sibling adapters and merge the richer fields into the same
 * `Senior` shape; the UI then upgrades in place.
 */

import type {
  CareRecipientProfile,
  CareTeamMember as ContractCareTeamMember,
  DataSource as ContractDataSource,
  DataSourceType as ContractDataSourceType,
} from "@models/CareRecipientProfile"
import type {
  CareTeamMember as ViewCareTeamMember,
  DataSource as ViewDataSource,
  DataSourceType as ViewDataSourceType,
  SeniorStatus,
} from "@/lib/mock-data"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Thin row used by the `/seniors` list page.
 *
 * Fields map 1:1 onto columns the backend list endpoint actually
 * returns today. Deliberately NOT named `Senior` so a future
 * enrichment pass cannot silently coerce a half-populated row into
 * the fuller view model expected by the detail screen.
 */
export interface CareRecipientListItem {
  id: string
  name: string
  /** Years as of "today". `null` when the backend has no DOB row. */
  age: number | null
  /** Single `primary_condition` lifted to an array for UI chip reuse. */
  primaryConditions: string[]
  /**
   * UI status ("routine" / "monitor" / "critical"). Phase 3 lacks a
   * backend signal for this, so every row defaults to `"routine"` —
   * the neutral emerald visual that does not falsely signal risk.
   * TODO(phase4): drive this from `alerts` + baseline breaches.
   */
  status: SeniorStatus
  /** Membership role + permission, straight from the join row. */
  role: string
  permissionLevel: string
  /** Server's `care_recipients.updated_at`. Used as a last-seen proxy. */
  updatedAt: string
}

/**
 * Header-card view model built from the full profile contract.
 *
 * Only the fields the `/seniors/[id]` header card actually renders
 * today. Below-header sections (AI summary, vitals, alerts, tabs)
 * continue to pull from `lib/mock-data.ts` in Phase 3 and are NOT
 * part of this shape — see `seniors/[id]/senior-profile-client.tsx`.
 */
export interface CareRecipientHeaderViewModel {
  id: string
  name: string
  age: number
  /**
   * Location label. The contract has no first-class `location`
   * column; we reuse `contact.address` when present so the header
   * still shows something. Empty string when the backend has no
   * address — the UI renders nothing, not "unknown".
   */
  location: string
  /**
   * Mapped from `riskLevel` (`low` → `routine`, `moderate` →
   * `monitor`, `high` → `critical`). This is the documented parallel
   * vocabulary — see `apps/web/docs/web-app.md` "Status / risk
   * vocabulary".
   */
  status: SeniorStatus
  primaryConditions: string[]
  /**
   * ISO timestamp rendered via `formatRelativeTime`. We use
   * `lastUpdated` (the row's `updated_at`) because Phase 3 has no
   * real device-activity signal — TODO(phase4): swap for the
   * most-recent observation timestamp once `health_observations`
   * lands.
   */
  lastSeen: string
  careTeam: ViewCareTeamMember[]
  dataSources: ViewDataSource[]
}

// ─── Enum / display maps ────────────────────────────────────────────────────

const RISK_LEVEL_TO_STATUS = Object.freeze({
  low: "routine",
  moderate: "monitor",
  high: "critical",
}) as Readonly<Record<string, SeniorStatus>>

/**
 * Contract data-source type → UI data-source type. Used by the
 * detail-page icon dict in `seniors/[id]/page.tsx` (`dataSourceIcon`).
 * Anything unknown falls to `"wearable"`, which has a neutral ⌚
 * icon — we never want to render a blank box when a new source type
 * is added upstream before the UI catches up.
 */
const CONTRACT_TYPE_TO_VIEW: Readonly<
  Record<ContractDataSourceType, ViewDataSourceType>
> = Object.freeze({
  apple_health: "wearable",
  fitbit: "wearable",
  garmin: "wearable",
  ring: "wearable",
  epic: "ehr",
  fall_detection: "fall_detection",
})

const CONTRACT_TYPE_TO_DISPLAY_NAME: Readonly<
  Record<ContractDataSourceType, string>
> = Object.freeze({
  apple_health: "Apple Health",
  fitbit: "Fitbit",
  garmin: "Garmin",
  ring: "Ring",
  epic: "Epic MyChart",
  fall_detection: "Fall Detection",
})

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Shape of a single row from `GET /care-recipients`.
 *
 * Repeated here (instead of importing from the service) so this
 * module stays pure — importing the service would drag `server-only`
 * into unit tests.
 */
export interface CareRecipientListInput {
  id: string
  name: string
  date_of_birth: string | null
  primary_condition: string | null
  created_at: string
  updated_at: string
  role: string
  permission_level: string
}

/**
 * Map the raw list-endpoint row to the view-model row.
 *
 * `asOf` is injected so unit tests (and Phase 4 cache layers) can
 * pin "today" without reaching for `Date.now()`. Production callers
 * omit it and get real-time.
 */
export function careRecipientListRowToItem(
  row: CareRecipientListInput,
  asOf: Date = new Date(),
): CareRecipientListItem {
  return {
    id: row.id,
    name: row.name,
    age: computeAge(row.date_of_birth, asOf),
    primaryConditions: row.primary_condition ? [row.primary_condition] : [],
    status: "routine",
    role: row.role,
    permissionLevel: row.permission_level,
    updatedAt: row.updated_at,
  }
}

/**
 * Map the full profile contract to the header-card view model.
 *
 * Every optional field is resolved to an empty-but-valid value so
 * the UI does not have to test for `undefined`. The care-team list
 * drops members without a display name (defensive — the contract
 * requires `name`, but a partial row must not crash the header).
 */
export function careRecipientProfileToHeader(
  profile: CareRecipientProfile,
): CareRecipientHeaderViewModel {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    location: profile.contact?.address ?? "",
    status: RISK_LEVEL_TO_STATUS[profile.riskLevel] ?? "routine",
    primaryConditions: [...(profile.primaryConditions ?? [])],
    lastSeen: profile.lastUpdated,
    careTeam: (profile.careTeam?.members ?? [])
      .filter((member) => Boolean(member?.name))
      .map(contractCareTeamMemberToView),
    dataSources: (profile.dataSources ?? []).map(contractDataSourceToView),
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Compute age in whole years from an ISO `YYYY-MM-DD` DOB.
 *
 * Returns `null` on any unparsable / missing input so callers can
 * show "—" instead of a nonsense number. The "month rollover" guard
 * mirrors the backend's `age` pre-computation in the profile
 * endpoint — clients that build their own age must stay consistent.
 */
function computeAge(dateOfBirth: string | null, asOf: Date): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(dob.getTime())) return null
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear()
  const asOfMonthDay =
    (asOf.getUTCMonth() + 1) * 100 + asOf.getUTCDate()
  const dobMonthDay =
    (dob.getUTCMonth() + 1) * 100 + dob.getUTCDate()
  if (asOfMonthDay < dobMonthDay) age -= 1
  return age < 0 ? null : age
}

/**
 * Map a contract care-team member to the UI shape.
 *
 * The contract does NOT carry phone, email, or organization — those
 * fields would be PHI we do not yet store. We pass empty strings for
 * phone/email and `null` for organization; the UI components have
 * been taught to omit those rows gracefully in Phase 3.
 */
function contractCareTeamMemberToView(
  member: ContractCareTeamMember,
): ViewCareTeamMember {
  return {
    id: member.id,
    name: member.name,
    role: humanizeEnum(member.role),
    organization: null,
    phone: "",
    email: "",
  }
}

/**
 * Map a contract data-source row to the UI shape.
 *
 * `name` is derived from the stable display-name table above so the
 * sidebar renders something friendly ("Apple Health") instead of the
 * machine name ("apple_health"). `lastSync` is always a string (not
 * optional) because the UI component currently treats it as required;
 * when missing we pass an empty string and the UI renders
 * "never synced" (the component change in this PR).
 */
function contractDataSourceToView(
  source: ContractDataSource,
): ViewDataSource {
  const viewType =
    CONTRACT_TYPE_TO_VIEW[source.type as ContractDataSourceType] ?? "wearable"
  const displayName =
    CONTRACT_TYPE_TO_DISPLAY_NAME[source.type as ContractDataSourceType] ??
    humanizeEnum(source.type)
  return {
    id: `${source.type}-${source.status}`,
    name: displayName,
    type: viewType,
    provider: displayName,
    connected: source.status === "connected",
    lastSync: source.lastSyncedAt ?? "",
  }
}

/** Turn `"primary_caregiver"` → `"Primary Caregiver"`. */
function humanizeEnum(value: string): string {
  return value
    .split("_")
    .map((part) =>
      part.length === 0 ? part : part[0].toUpperCase() + part.slice(1),
    )
    .join(" ")
}
