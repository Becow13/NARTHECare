import { parseAlertListQuery } from "../lib/alerts.js"
import {
  fetchAlertsForRecipient,
  fetchAlertsAcrossRecipients,
  ensureAlertSchema,
} from "./dao/alertDao.js"
import { fetchCareRecipientsForUser } from "./dao/careRecipientDao.js"

/**
 * List alerts for a single care recipient, newest-first.
 *
 * The route handler MUST gate on `requireCareRecipientAccess` first;
 * this service is RBAC-agnostic so the Phase 4B alert engine can reuse
 * it for self-checks after writing a row.
 */
export async function listAlertsForRecipient(pool, recipientId, query) {
  const filters = parseAlertListQuery(query)
  const rows = await fetchAlertsForRecipient(pool, recipientId, filters)
  return { alerts: rows }
}

/**
 * Cross-recipient alert feed for a single user.
 *
 * Steps:
 *   1. Resolve the user's accessible care-recipient ids via the existing
 *      care-team join (no application-side filtering).
 *   2. If the user has no recipients, return `{ alerts: [] }` without
 *      hitting the alerts table — keeps the "user has no recipients yet"
 *      path log-quiet.
 *   3. Fetch alerts for that id-set with the user's optional filters.
 *
 * Audit happens at the route layer (`LIST_ALERTS_ACROSS_RECIPIENTS` with
 * `metadata.count` only, never PHI).
 */
export async function listAlertsForUser(pool, userId, query) {
  const filters = parseAlertListQuery(query)
  const recipientRows = await fetchCareRecipientsForUser(pool, userId)
  const recipientIds = recipientRows.map((r) => r.id)
  if (recipientIds.length === 0) return { alerts: [] }
  const rows = await fetchAlertsAcrossRecipients(pool, recipientIds, filters)
  return { alerts: rows }
}

/**
 * Run the idempotent schema migration for `alerts`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureAlertSchema(pool)
}
