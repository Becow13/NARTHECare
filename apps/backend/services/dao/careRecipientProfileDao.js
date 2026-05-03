/**
 * DAO that assembles the `CareRecipientProfile` contract shape from
 * the canonical Phase 4 tables.
 *
 * The profile is a read-only composite — every field is sourced from
 * a table the rest of the app already owns:
 *
 *   - `care_recipients`               → name, dob, primary_condition,
 *                                       relationship, emergency contact
 *   - `care_team_members` ⨝ `users`   → care team list
 *   - `care_recipient_data_sources`   → connected sources + last sync
 *   - `metric_baselines`              → steps / sleep / HR baselines
 *
 * No PHI is logged here. The route handler MUST gate on
 * `requireCareRecipientAccess` before calling this function — the
 * SQL is RBAC-agnostic (defense in depth: the access gate is the
 * primary defense).
 *
 * Returns `null` when the recipient row does not exist so the route
 * layer can 404 the request honestly. Empty satellite tables (no
 * baselines, no data sources) collapse to empty arrays / sensible
 * defaults — never to fabricated PHI.
 */

import {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
} from "../../../../shared/models/CareRecipientProfile.js"

// ─── SQL ────────────────────────────────────────────────────────────────────

const SELECT_RECIPIENT_SQL = `
  SELECT id, name, date_of_birth, primary_condition, relationship,
         emergency_contact_name, emergency_contact_phone,
         created_at, updated_at
  FROM care_recipients
  WHERE id = $1
  LIMIT 1;
`

// Care team is a join through users so display names land alongside
// each membership row. Newly-created recipients always have at least
// one entry (the creator) so the list is never empty in practice.
const SELECT_CARE_TEAM_SQL = `
  SELECT ctm.id, ctm.role, ctm.permission_level,
         u.display_name, u.email
  FROM care_team_members ctm
  INNER JOIN users u ON u.id = ctm.user_id
  WHERE ctm.care_recipient_id = $1
  ORDER BY ctm.created_at ASC;
`

const SELECT_DATA_SOURCES_SQL = `
  SELECT source_type, status, last_synced_at, error_message
  FROM care_recipient_data_sources
  WHERE care_recipient_id = $1
  ORDER BY source_type ASC;
`

// Pull the latest computed baseline per metric. Phase 4B writes one
// row per (recipient, metric, window) — the profile only needs the
// freshest one per metric for the at-a-glance card.
const SELECT_LATEST_BASELINES_SQL = `
  SELECT DISTINCT ON (metric_type)
    metric_type, p10_numeric, p50_numeric, p90_numeric,
    sample_count, computed_at
  FROM metric_baselines
  WHERE care_recipient_id = $1
  ORDER BY metric_type ASC, computed_at DESC;
`

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * Assemble the full `CareRecipientProfile` for the given id from the
 * canonical Phase 4 tables. Returns `null` when no recipient row
 * matches so the route handler can respond with 404.
 *
 * The shape mirrors `shared/models/CareRecipientProfile.{ts,js}`
 * exactly. Optional fields collapse to empty strings / arrays /
 * neutral defaults (`riskLevel = "low"`) when the underlying row is
 * absent — we never fabricate PHI here. Missing data sources fold
 * into a static "neutral list" so the dashboard's Data Sources card
 * always renders one row per supported integration even before the
 * caregiver connects anything.
 */
export async function fetchCareRecipientProfile(pool, recipientId) {
  const { rows: recipientRows } = await pool.query(SELECT_RECIPIENT_SQL, [
    recipientId,
  ])
  const recipient = recipientRows[0]
  if (!recipient) return null

  const [{ rows: teamRows }, { rows: dataSourceRows }, { rows: baselineRows }] =
    await Promise.all([
      pool.query(SELECT_CARE_TEAM_SQL, [recipientId]),
      pool.query(SELECT_DATA_SOURCES_SQL, [recipientId]),
      pool.query(SELECT_LATEST_BASELINES_SQL, [recipientId]),
    ])

  return {
    id: recipient.id,
    name: recipient.name,
    age: _ageFromDateOfBirth(recipient.date_of_birth),
    dateOfBirth: _isoDate(recipient.date_of_birth),
    primaryConditions: recipient.primary_condition
      ? [recipient.primary_condition]
      : [],
    riskLevel: RISK_LEVELS.low,
    contact: {},
    emergencyContact: _buildEmergencyContact(recipient),
    careTeam: _buildCareTeam(teamRows),
    healthBackground: {
      conditions: recipient.primary_condition
        ? [recipient.primary_condition]
        : [],
      allergies: [],
      medications: [],
    },
    dataSources: _buildDataSources(dataSourceRows),
    baseline: _buildBaseline(baselineRows),
    recentNotes: [],
    lastUpdated: _isoTimestamp(recipient.updated_at),
  }
}

/**
 * Idempotent migration for the satellite tables this DAO joins on.
 *
 * Today every satellite table has its own `ensureSchema` helper in
 * the per-feature DAO, so this remains a no-op kept around so the
 * service barrel does not have to special-case the profile path.
 */
// eslint-disable-next-line no-unused-vars
export async function ensureCareRecipientProfileSchema(pool) {
  return undefined
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _ageFromDateOfBirth(value) {
  if (!value) return 0
  const dob = new Date(value)
  if (Number.isNaN(dob.getTime())) return 0
  const now = new Date()
  let age = now.getUTCFullYear() - dob.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth()
  const dayDiff = now.getUTCDate() - dob.getUTCDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1
  return age >= 0 ? age : 0
}

function _isoDate(value) {
  if (!value) return ""
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "string") return value.slice(0, 10)
  return ""
}

function _isoTimestamp(value) {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return new Date().toISOString()
}

function _buildEmergencyContact(row) {
  const name =
    typeof row.emergency_contact_name === "string"
      ? row.emergency_contact_name
      : ""
  const phone =
    typeof row.emergency_contact_phone === "string"
      ? row.emergency_contact_phone
      : ""
  if (!name && !phone) return { name: "", phone: "" }
  return {
    name,
    phone,
    relationship:
      typeof row.relationship === "string" && row.relationship.length > 0
        ? row.relationship
        : undefined,
  }
}

function _buildCareTeam(rows) {
  const members = rows.map((row) => ({
    id: row.id,
    name: row.display_name ?? row.email ?? "Unnamed caregiver",
    role: row.role,
    permission: row.permission_level,
  }))
  const primary =
    members.find((m) => m.role === "primary_caregiver")?.name ??
    members[0]?.name ??
    ""
  return { primaryCaregiver: primary, members }
}

// Render one row per supported integration so the dashboard never
// shows an inconsistent partial list. Anything not in the registry
// surfaces as `not_connected`. Anything in the registry overrides
// the neutral default with the caregiver's real status. We collapse
// the registry-only `healthkit` source_type onto the dashboard's
// `apple_health` view — the iOS sync companion writes the transport
// identifier; the UI shows the user-facing data category.
function _buildDataSources(rows) {
  const supported = [
    DATA_SOURCE_TYPES.appleHealth,
    DATA_SOURCE_TYPES.epic,
    DATA_SOURCE_TYPES.fitbit,
    DATA_SOURCE_TYPES.garmin,
    DATA_SOURCE_TYPES.ring,
    DATA_SOURCE_TYPES.fallDetection,
  ]
  const byType = new Map()
  for (const row of rows) {
    const type =
      row.source_type === "healthkit"
        ? DATA_SOURCE_TYPES.appleHealth
        : row.source_type
    if (!supported.includes(type)) continue
    byType.set(type, {
      type,
      status: row.status,
      lastSyncedAt: row.last_synced_at
        ? row.last_synced_at instanceof Date
          ? row.last_synced_at.toISOString()
          : String(row.last_synced_at)
        : undefined,
      errorMessage: row.error_message ?? undefined,
    })
  }
  return supported.map(
    (type) =>
      byType.get(type) ?? {
        type,
        status: DATA_SOURCE_STATUSES.notConnected,
      },
  )
}

// Convert the latest-baseline rows (one per metric_type) into the
// profile-contract baseline shape. Missing metrics drop out — the UI
// renders only the metrics with real computed bands. No values are
// fabricated.
function _buildBaseline(rows) {
  const byMetric = new Map()
  for (const row of rows) {
    byMetric.set(row.metric_type, row)
  }
  const baseline = {}
  const steps = byMetric.get("steps")
  if (steps && steps.p10_numeric != null && steps.p90_numeric != null) {
    baseline.steps = { min: Number(steps.p10_numeric), max: Number(steps.p90_numeric) }
  }
  const sleep = byMetric.get("sleep_hours")
  if (sleep && sleep.p10_numeric != null && sleep.p90_numeric != null) {
    baseline.sleepHours = {
      min: Number(sleep.p10_numeric),
      max: Number(sleep.p90_numeric),
    }
  }
  const restingHr = byMetric.get("resting_heart_rate")
  if (
    restingHr &&
    restingHr.p10_numeric != null &&
    restingHr.p90_numeric != null
  ) {
    baseline.restingHeartRate = {
      min: Number(restingHr.p10_numeric),
      max: Number(restingHr.p90_numeric),
    }
  }
  const lastUpdated = rows
    .map((r) => r.computed_at)
    .filter(Boolean)
    .sort()
    .pop()
  if (lastUpdated) {
    baseline.lastUpdated =
      lastUpdated instanceof Date ? lastUpdated.toISOString() : String(lastUpdated)
  }
  return baseline
}
