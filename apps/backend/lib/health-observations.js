/**
 * Health-observation parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the read route handler,
 * the Phase 4A sync route handler, the service layer, future ingest
 * pipelines, and unit tests, so it must be safe to import from any
 * context without side effects. All DB access lives in
 * `services/dao/healthObservationDao.js`.
 *
 * Phase 4 shipped the read surface; Phase 4A adds the write path
 * (`POST /healthkit/sync`) using the same metric-type and unit
 * strings so the contract never drifts between read and write.
 *
 * The shared `HealthObservation` constants are re-exported from
 * `shared/models/HealthObservation.js` so the backend, web, and iOS
 * agree on the same enum values; the relative path mirrors
 * `lib/data-sources.js`.
 */

import {
  HEALTH_OBSERVATION_METRIC_TYPES,
  HEALTH_OBSERVATION_UNITS,
  HEALTH_OBSERVATION_UNIT_BY_METRIC_TYPE,
  SYNC_SOURCE_TYPES,
} from "../../../shared/models/HealthObservation.js"

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Canonical `metric_type` values persisted in
 * `health_observations.metric_type`. Re-exported under both the
 * legacy short name and the long form for in-place compatibility
 * with Phase 4 read-side callers.
 */
export const METRIC_TYPES = HEALTH_OBSERVATION_METRIC_TYPES

/** The set of accepted metric_type strings — used for query + payload validation. */
const METRIC_TYPE_SET = new Set(Object.values(METRIC_TYPES))

/** Canonical units paired with each metric type; the DB never has to interpret iOS-side enums. */
export const METRIC_UNITS = HEALTH_OBSERVATION_UNITS

/** Allowed `unit` per `metric_type`. Re-exported from the shared model. */
export const METRIC_UNIT_BY_METRIC_TYPE = HEALTH_OBSERVATION_UNIT_BY_METRIC_TYPE

/**
 * Canonical `source_type` values for any row referencing an external
 * origin. The set is intentionally a SUPERSET of
 * `SYNC_SOURCE_TYPES` because the table also holds Epic-sourced
 * rows and back-filled `apple_health` rows that never travel
 * through the iOS sync endpoint.
 */
export const OBSERVATION_SOURCE_TYPES = Object.freeze({
  appleHealth: "apple_health",
  /** Inbound-from-iOS marker used by `POST /healthkit/sync`. */
  healthkit: SYNC_SOURCE_TYPES.healthkit,
  epic: "epic",
  manual: SYNC_SOURCE_TYPES.manual,
})

/** Source types accepted by `POST /healthkit/sync`. */
const SYNC_SOURCE_TYPE_SET = new Set(Object.values(SYNC_SOURCE_TYPES))

/** Server-side defaults / hard caps for the list endpoint. */
export const DEFAULT_LIST_LIMIT = 200
export const MAX_LIST_LIMIT = 1000

/**
 * Hard cap on observations per `POST /healthkit/sync` call. iOS batches
 * are expected to be a few hundred samples; anything larger is almost
 * certainly a misbehaving client and is rejected before the route hits
 * the DB so a runaway loop cannot fill the table in one request.
 */
export const MAX_SYNC_BATCH_SIZE = 1000

// ─── Query parsing (read endpoint) ──────────────────────────────────────────

/**
 * Normalize the `?metricType=&since=&limit=` query string for the list
 * endpoint into DB-ready filters.
 *
 * Throws a plain `Error` on invalid input so the route handler can
 * translate the message into a 400 response (mirrors `parseCareRecipientInput`).
 * Unknown keys are ignored — the handler must rely on this single function
 * rather than reading `req.query` directly so future filters land in one place.
 */
export function parseObservationListQuery(query) {
  const raw = query ?? {}
  const metricType = _parseMetricType(raw.metricType ?? raw.metric_type)
  const since = _parseSince(raw.since)
  const limit = _parseLimit(raw.limit)
  return { metricType, since, limit }
}

// ─── Sync payload parsing (write endpoint) ──────────────────────────────────

/**
 * Normalize a `POST /healthkit/sync` request body into validated
 * batch + DB-ready rows.
 *
 * The function is deliberately split from the DAO insert so that the
 * route handler can reject contract-broken payloads with a single 400
 * before the transaction opens, and so the validation surface is
 * exercised by unit tests without standing up a fake pool.
 *
 * Throws a plain `Error` (→ 400 at the route layer) on:
 *   - missing / non-string `careRecipientId`
 *   - missing / non-array / oversized `observations`
 *   - any per-observation contract violation (unknown enum, bad
 *     timestamp, value-shape mismatch, unit/metric mismatch)
 *
 * Per-observation errors include the index so the iOS client can
 * surface "sample 12 was rejected" telemetry without echoing PHI.
 *
 * Returns the parsed `careRecipientId` plus a `rows` array shaped 1:1
 * for `INSERT INTO health_observations` — `value_numeric`,
 * `value_unit`, `observed_at`, `source_type`, `source_id`,
 * `source_record_id`, and `metadata` columns. The caller is the only
 * thing that supplies `care_recipient_id` per row (at the DAO layer)
 * so the access gate at the route layer is the single point of
 * truth for which recipient a payload may write to.
 */
export function parseSyncRequestBody(body) {
  const raw = body ?? {}
  const careRecipientId = _parseRequiredUuid(
    raw.careRecipientId ?? raw.care_recipient_id,
    "careRecipientId",
  )

  const observations = raw.observations
  if (!Array.isArray(observations)) {
    throw new Error("observations (array) is required")
  }
  if (observations.length === 0) {
    throw new Error("observations must contain at least one sample")
  }
  if (observations.length > MAX_SYNC_BATCH_SIZE) {
    throw new Error(
      `observations exceeds maximum batch size of ${MAX_SYNC_BATCH_SIZE}`,
    )
  }

  const rows = observations.map((sample, index) =>
    _parseObservationSample(sample, index),
  )

  return { careRecipientId, rows }
}

/**
 * Set of metric_type strings present in a parsed batch. Returned as a
 * sorted array so the audit row's `metricTypes` field is deterministic
 * (helpful for assertions and easier to read in ops dashboards). No
 * per-sample values, ids, or timestamps in the audit metadata — only
 * the set of categories the caregiver synced this round.
 */
export function distinctMetricTypes(rows) {
  return [...new Set(rows.map((r) => r.metric_type))].sort()
}

// ─── Manual observation input parsing (caregiver web entry) ─────────────────

/**
 * Normalize a single caregiver-entered manual observation from the web UI.
 *
 * Deliberately simpler than `parseSyncRequestBody` — no `sourceRecordId`
 * is required because manual entries do not come from a deduplication-
 * capable external source. The `source_record_id` is left `null` so the
 * partial UNIQUE index on `(source_type, source_record_id)` does not
 * apply, and the caregiver can record multiple readings for the same metric
 * type on the same day. The `value_unit` is inferred server-side from the
 * `metricType` so the frontend does not need to carry the unit enum.
 *
 * Throws a plain `Error` (→ 400 at the route layer) on:
 *   - missing / unknown `metricType`
 *   - missing / non-finite `value`
 *   - missing / invalid `observedAt` ISO timestamp
 *
 * Returns a row shaped for `INSERT INTO health_observations` — field names
 * are the SQL column names (`metric_type`, `value_numeric`, …) so the DAO
 * can accept it without reshaping.
 */
export function parseManualObservationInput(body) {
  const raw = body ?? {}

  const metricType = raw.metricType ?? raw.metric_type
  if (typeof metricType !== "string" || !METRIC_TYPE_SET.has(metricType)) {
    throw new Error(
      `metricType must be one of: ${[...METRIC_TYPE_SET].join(", ")}`,
    )
  }

  const valueRaw = raw.value ?? raw.value_numeric
  const value = Number(valueRaw)
  if (!Number.isFinite(value)) {
    throw new Error("value must be a finite number")
  }

  const observedAt = _parseRequiredIsoTimestamp(
    raw.observedAt ?? raw.observed_at,
    "observedAt",
  )

  return {
    metric_type: metricType,
    value_numeric: value,
    value_unit: METRIC_UNIT_BY_METRIC_TYPE[metricType],
    observed_at: observedAt,
    source_type: OBSERVATION_SOURCE_TYPES.manual,
    source_id: null,
    source_record_id: null,
    metadata: null,
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parseMetricType(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("metricType must be a string when provided")
  }
  if (!METRIC_TYPE_SET.has(value)) {
    throw new Error(`Unknown metricType: ${value}`)
  }
  return value
}

function _parseSince(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("since must be an ISO timestamp string when provided")
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid since: ${value}`)
  }
  return new Date(ms).toISOString()
}

function _parseLimit(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIST_LIMIT
  }
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("limit must be a positive integer")
  }
  return Math.min(n, MAX_LIST_LIMIT)
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function _parseRequiredUuid(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} (uuid string) is required`)
  }
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`)
  }
  return value
}

function _parseObservationSample(sample, index) {
  if (sample === null || typeof sample !== "object" || Array.isArray(sample)) {
    throw new Error(`observations[${index}] must be an object`)
  }

  const sourceType = sample.sourceType ?? sample.source_type
  if (typeof sourceType !== "string" || !SYNC_SOURCE_TYPE_SET.has(sourceType)) {
    throw new Error(`observations[${index}] has unknown sourceType`)
  }

  const sourceRecordId = sample.sourceRecordId ?? sample.source_record_id
  if (typeof sourceRecordId !== "string" || sourceRecordId.length === 0) {
    throw new Error(`observations[${index}] requires sourceRecordId (string)`)
  }

  const metricType = sample.metricType ?? sample.metric_type
  if (typeof metricType !== "string" || !METRIC_TYPE_SET.has(metricType)) {
    throw new Error(`observations[${index}] has unknown metricType`)
  }

  const unit = sample.unit
  const expectedUnit = METRIC_UNIT_BY_METRIC_TYPE[metricType]
  if (typeof unit !== "string" || unit !== expectedUnit) {
    throw new Error(
      `observations[${index}] unit must be "${expectedUnit}" for metricType "${metricType}"`,
    )
  }

  const value = Number(sample.value)
  if (!Number.isFinite(value)) {
    throw new Error(`observations[${index}] value must be a finite number`)
  }

  const measuredAt = _parseRequiredIsoTimestamp(
    sample.measuredAt ?? sample.measured_at,
    `observations[${index}] measuredAt`,
  )

  // `startAt` / `endAt` are optional (cumulative samples don't carry
  // them); validated when present so a malformed range does not slip
  // into `metadata` later.
  const startAt = _parseOptionalIsoTimestamp(
    sample.startAt ?? sample.start_at,
    `observations[${index}] startAt`,
  )
  const endAt = _parseOptionalIsoTimestamp(
    sample.endAt ?? sample.end_at,
    `observations[${index}] endAt`,
  )

  const metadata = _parseMetadata(sample.metadata, index, { startAt, endAt })

  return {
    metric_type: metricType,
    value_numeric: value,
    value_unit: unit,
    observed_at: measuredAt,
    source_type: sourceType,
    source_id: null,
    source_record_id: sourceRecordId,
    metadata,
  }
}

function _parseRequiredIsoTimestamp(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} (ISO timestamp) is required`)
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new Error(`${field} is not a valid ISO timestamp`)
  }
  return new Date(ms).toISOString()
}

function _parseOptionalIsoTimestamp(value, field) {
  if (value === undefined || value === null || value === "") return null
  return _parseRequiredIsoTimestamp(value, field)
}

function _parseMetadata(value, index, range) {
  // Range timestamps live in `metadata` so the read path can show the
  // sample's window without reshaping the canonical observation row.
  // Persist `null` (not `{}`) when nothing was provided so audit + DB
  // size stay tight on the common case.
  const merged = {}
  if (value !== undefined && value !== null) {
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`observations[${index}] metadata must be an object`)
    }
    Object.assign(merged, value)
  }
  if (range.startAt) merged.startAt = range.startAt
  if (range.endAt) merged.endAt = range.endAt
  return Object.keys(merged).length === 0 ? null : merged
}
