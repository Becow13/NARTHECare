import {
  parseObservationListQuery,
  parseSyncRequestBody,
  parseManualObservationInput,
  distinctMetricTypes,
} from "../lib/health-observations.js"
import {
  fetchObservationsForRecipient,
  insertObservationsBatch,
  ensureHealthObservationSchema,
} from "./dao/healthObservationDao.js"
import {
  upsertSyncStatus,
  fetchSyncStatus,
} from "./dao/careRecipientDataSourceDao.js"
import { touchCareRecipient } from "./dao/careRecipientDao.js"
import { DATA_SOURCE_STATUSES } from "../../../shared/models/CareRecipientProfile.js"
import { SYNC_SOURCE_TYPES } from "../../../shared/models/HealthObservation.js"

/**
 * List observations for a care recipient, newest-first.
 *
 * The route handler MUST call `careRecipientService.requireCareRecipientAccess`
 * before reaching this function — the service is intentionally protocol- and
 * RBAC-agnostic so it can be reused by future background jobs (baseline
 * compute, alert evaluation) that already operate on a known-authorized
 * recipient id. Validation errors surface as plain `Error`s (→ 400 at the
 * route layer); unexpected DB failures propagate for the 500 handler.
 */
export async function listObservationsForRecipient(pool, recipientId, query) {
  const filters = parseObservationListQuery(query)
  const rows = await fetchObservationsForRecipient(pool, recipientId, filters)
  return { observations: rows }
}

/**
 * Persist a HealthKit sync batch and update the registry row.
 *
 * The route handler MUST call
 * `careRecipientService.requireCareRecipientAccess` BEFORE this
 * function — the service is RBAC-agnostic so the parsed body's
 * `careRecipientId` cannot escalate the route's already-authorized
 * recipient id. The handler also passes `recipientId` separately so
 * we can assert the body matches what the access gate verified, which
 * blocks a misconfigured client from writing to a different recipient
 * inside an authorized request.
 *
 * Validation errors (parser, body/recipient mismatch) surface as
 * plain `Error`s for the route layer to translate into 400. The
 * registry is upserted to `connected` on success and to `error` on a
 * caught DB failure so the dashboard's Data Sources card reflects the
 * last-known state without polling. Unexpected failures rethrow so
 * the route layer's 500 handler runs after the registry has been
 * marked `error` — `error_message` is a generic, PHI-free string.
 *
 * Returns the count envelope the route hands back to iOS — never
 * echoes per-observation values, ids, or timestamps.
 */
export async function syncHealthkitObservations(pool, recipientId, body) {
  const { careRecipientId, rows } = parseSyncRequestBody(body)
  if (careRecipientId !== recipientId) {
    throw new Error("careRecipientId mismatch")
  }

  const sourceType = SYNC_SOURCE_TYPES.healthkit

  let result
  try {
    result = await insertObservationsBatch(pool, recipientId, rows)
  } catch (e) {
    // Registry-update failure here is non-fatal to the original error;
    // we deliberately do not log either body content or DB internals.
    try {
      await upsertSyncStatus(pool, {
        careRecipientId: recipientId,
        sourceType,
        status: DATA_SOURCE_STATUSES.error,
        errorMessage: "Failed to store one or more observations.",
      })
    } catch {
      /* swallow — surface the original error for the 500 handler */
    }
    throw e
  }

  const registry = await upsertSyncStatus(pool, {
    careRecipientId: recipientId,
    sourceType,
    status: DATA_SOURCE_STATUSES.connected,
    lastSyncedAt: new Date().toISOString(),
    errorMessage: null,
  })

  // Bump `care_recipients.updated_at` only when at least one new
  // observation was actually persisted. A dedupe-only sync (every row
  // collapsed by the partial UNIQUE) does not mutate recipient state,
  // so leaving the timestamp untouched keeps `updated_at` honest about
  // "last meaningful change". Failure here is non-fatal to the sync
  // result already returned to iOS — `care_recipient_data_sources`
  // already carries the authoritative `last_synced_at` and the next
  // successful sync will catch up.
  if (result.accepted > 0) {
    try {
      await touchCareRecipient(pool, recipientId)
    } catch (e) {
      console.warn("[API healthkit-sync] touchCareRecipient failed", {
        reason: e instanceof Error ? e.message : "unknown",
      })
    }
  }

  return {
    accepted: result.accepted,
    deduped: result.deduped,
    rejected: 0,
    lastSyncedAt: registry?.last_synced_at ?? null,
    metricTypes: distinctMetricTypes(rows),
  }
}

/**
 * Read the HealthKit sync registry row for the given recipient.
 *
 * Returns a neutral `not_connected` envelope when no registry row
 * exists yet so the iOS sync-status surface does not have to branch
 * on missing rows. The actual existence of the row is hidden from the
 * caller — only the dashboard-shaped fields are returned.
 */
export async function getHealthkitSyncStatus(pool, recipientId) {
  const row = await fetchSyncStatus(pool, recipientId, SYNC_SOURCE_TYPES.healthkit)
  if (!row) {
    return {
      status: DATA_SOURCE_STATUSES.notConnected,
      lastSyncedAt: null,
      errorMessage: null,
    }
  }
  return {
    status: row.status,
    lastSyncedAt: row.last_synced_at ?? null,
    errorMessage: row.error_message ?? null,
  }
}

/**
 * Run the idempotent schema migration for `health_observations`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureHealthObservationSchema(pool)
}

/**
 * Persist a single caregiver-entered manual observation.
 *
 * The route handler MUST call `careRecipientService.requireCareRecipientAccess`
 * before reaching this function. Validation errors from the parser surface as
 * plain `Error`s (→ 400 at the route layer). Bumps `care_recipients.updated_at`
 * on successful insert so the Care Members list reflects the new reading.
 *
 * Returns `{ accepted: 1 }` on insert, `{ accepted: 0 }` if the row was a
 * no-op (should not happen for manual entries with null source_record_id, but
 * the count is passed through for transparency).
 */
export async function insertManualObservation(pool, recipientId, body) {
  const row = parseManualObservationInput(body)
  const result = await insertObservationsBatch(pool, recipientId, [row])
  if (result.accepted > 0) {
    try {
      await touchCareRecipient(pool, recipientId)
    } catch (e) {
      console.warn("[healthObservationService] touchCareRecipient failed", {
        reason: e instanceof Error ? e.message : "unknown",
      })
    }
  }
  return { accepted: result.accepted }
}
