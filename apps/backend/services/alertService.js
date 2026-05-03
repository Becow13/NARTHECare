import { parseAlertListQuery } from "../lib/alerts.js"
import { evaluateAlertRules } from "../lib/alert-rules.js"
import { windowStartIso } from "../lib/baseline-stats.js"
import { MAX_LIST_LIMIT } from "../lib/health-observations.js"
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "../lib/audit.js"
import {
  fetchAlertsForRecipient,
  fetchAlertsAcrossRecipients,
  insertAlerts,
  ensureAlertSchema,
} from "./dao/alertDao.js"
import { fetchObservationsForRecipient } from "./dao/healthObservationDao.js"
import { fetchBaselinesForRecipient } from "./dao/metricBaselineDao.js"
import {
  fetchCareRecipientsForUser,
  fetchAllCareRecipientIds,
} from "./dao/careRecipientDao.js"
import { logAction } from "./auditService.js"

/**
 * How many days of recent observations the engine pulls per recipient.
 * 7 keeps every threshold rule's "latest sample" decision honest
 * (anything older than that is stale enough that we'd rather wait for
 * a fresh reading than alert on a week-old number).
 */
const RECENT_OBSERVATION_WINDOW_DAYS = 7

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
 * Evaluate every Phase 4B rule against a single recipient's recent
 * observations + current baselines and persist any new alerts.
 *
 * Background-job entry point — no route handler calls this directly.
 * RBAC-agnostic on purpose because the job loop runs without a user
 * context. `now` is injected so a multi-recipient sweep stamps every
 * `walking_steadiness.declining` row with the same reference clock.
 *
 * Idempotency: every alert candidate carries a deterministic
 * `source_record_id` (see `lib/alert-rules.js`); the DAO's partial
 * UNIQUE collapses repeated runs into one row per (rule, evidence
 * day). The returned `{ accepted, deduped }` envelope drives the
 * audit row's count metadata — never the alert titles or values.
 */
export async function evaluateAlertsForRecipient(
  pool,
  recipientId,
  { now = new Date(), audit = true } = {},
) {
  const since = windowStartIso(now, RECENT_OBSERVATION_WINDOW_DAYS)
  const observations = await fetchObservationsForRecipient(pool, recipientId, {
    since,
    limit: MAX_LIST_LIMIT,
  })
  const baselines = await fetchBaselinesForRecipient(pool, recipientId, {})
  const { alerts } = evaluateAlertRules({ observations, baselines, now })
  const result = await insertAlerts(pool, recipientId, alerts)
  const categories = _distinctCategories(alerts)

  if (audit) {
    await logAction(pool, {
      actorUserId: null,
      action: AUDIT_ACTIONS.evaluateAlerts,
      resourceType: AUDIT_RESOURCE_TYPES.alert,
      resourceId: recipientId,
      // Counts + the SET of rule categories — never alert titles,
      // explanations, evidence values, or per-row source_record_ids.
      // The category set is fixed by the engine vocabulary so it
      // carries no PHI.
      metadata: {
        candidates: alerts.length,
        accepted: result.accepted,
        deduped: result.deduped,
        categories,
      },
      ipAddress: null,
      userAgent: null,
    })
  }

  return {
    careRecipientId: recipientId,
    candidates: alerts.length,
    accepted: result.accepted,
    deduped: result.deduped,
    categories,
  }
}

/**
 * Sweep every recipient and evaluate alerts.
 *
 * Sequential by design — one recipient at a time keeps the DB pool
 * usage bounded on the cron host. Per-recipient errors are surfaced
 * through `errors[]` and the sweep continues; a single bad recipient
 * must never abort a nightly job. Job-level audit aggregation happens
 * in the entry-point script.
 */
export async function evaluateAlertsForAllRecipients(
  pool,
  { now = new Date(), onRecipient = null } = {},
) {
  const recipientIds = await fetchAllCareRecipientIds(pool)
  let recipientsProcessed = 0
  let alertsAccepted = 0
  let alertsDeduped = 0
  const errors = []

  for (const recipientId of recipientIds) {
    try {
      const result = await evaluateAlertsForRecipient(pool, recipientId, { now })
      recipientsProcessed += 1
      alertsAccepted += result.accepted
      alertsDeduped += result.deduped
      if (typeof onRecipient === "function") {
        await onRecipient(result)
      }
    } catch (err) {
      console.error("[jobs evaluate-alerts]", {
        recipientId,
        message: err instanceof Error ? err.message : String(err),
      })
      errors.push({
        recipientId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    recipientCount: recipientIds.length,
    recipientsProcessed,
    alertsAccepted,
    alertsDeduped,
    errors,
  }
}

/**
 * Run the idempotent schema migration for `alerts`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureAlertSchema(pool)
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _distinctCategories(alerts) {
  return [...new Set(alerts.map((a) => a.category).filter(Boolean))].sort()
}
