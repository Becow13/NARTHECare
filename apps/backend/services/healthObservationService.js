import { parseObservationListQuery } from "../lib/health-observations.js"
import {
  fetchObservationsForRecipient,
  ensureHealthObservationSchema,
} from "./dao/healthObservationDao.js"

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
 * Run the idempotent schema migration for `health_observations`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureHealthObservationSchema(pool)
}
