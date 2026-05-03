import { fetchObservationsForRecipient } from "./dao/healthObservationDao.js"
import { fetchBaselinesForRecipient } from "./dao/metricBaselineDao.js"
import { fetchSummariesForRecipient } from "./dao/aiSummaryDao.js"
import { fetchAlertsForRecipient } from "./dao/alertDao.js"
import { fetchAppointmentsForRecipient } from "./dao/appointmentDao.js"
import { fetchDataSourcesForRecipient } from "./dao/careRecipientDataSourceDao.js"
import { fetchSyncStatus } from "./dao/careRecipientDataSourceDao.js"
import { SYNC_SOURCE_TYPES } from "../../../shared/models/HealthObservation.js"
import { DATA_SOURCE_STATUSES } from "../../../shared/models/CareRecipientProfile.js"

/**
 * Composite "dashboard" read for a single care recipient.
 *
 * The route handler MUST call `requireCareRecipientAccess` BEFORE
 * this function — the service is RBAC-agnostic so the same
 * aggregation can be reused by future caregiver-facing surfaces
 * (mobile, daily digest email) without re-checking the gate.
 *
 * Returns a single envelope with every section the web dashboard
 * needs in one round-trip:
 *
 *   - `latestObservations` — newest-first slice from `health_observations`
 *   - `baselines`          — current metric baselines (for "Baseline Status")
 *   - `latestSummary`      — most recent AI summary (or null)
 *   - `activeAlerts`       — open + acknowledged alerts (caps at limit)
 *   - `upcomingAppointments` — newest-first appointment row(s)
 *   - `dataSources`        — registry rows (Apple Health, Epic, …)
 *   - `healthkitSync`      — current iOS sync status
 *
 * Empty arrays / null fields are returned when the underlying tables
 * have no rows — the UI MUST render honest empty states rather than
 * mock fallbacks. No PHI is logged here; counts only when the route
 * layer emits the audit row.
 */
export async function getCareRecipientDashboard(
  pool,
  recipientId,
  {
    observationLimit = 50,
    summaryLimit = 1,
    alertLimit = 25,
    appointmentLimit = 5,
  } = {},
) {
  const [
    observations,
    baselines,
    summaries,
    alerts,
    appointments,
    dataSources,
    healthkitRow,
  ] = await Promise.all([
    fetchObservationsForRecipient(pool, recipientId, {
      limit: observationLimit,
    }),
    fetchBaselinesForRecipient(pool, recipientId, {}),
    fetchSummariesForRecipient(pool, recipientId, { limit: summaryLimit }),
    fetchAlertsForRecipient(pool, recipientId, { limit: alertLimit }),
    fetchAppointmentsForRecipient(pool, recipientId, {
      limit: appointmentLimit,
    }),
    fetchDataSourcesForRecipient(pool, recipientId),
    fetchSyncStatus(pool, recipientId, SYNC_SOURCE_TYPES.healthkit),
  ])

  return {
    latestObservations: observations,
    baselines,
    latestSummary: summaries[0] ?? null,
    activeAlerts: alerts,
    upcomingAppointments: appointments,
    dataSources,
    healthkitSync: healthkitRow
      ? {
          status: healthkitRow.status,
          lastSyncedAt: healthkitRow.last_synced_at ?? null,
          errorMessage: healthkitRow.error_message ?? null,
        }
      : {
          status: DATA_SOURCE_STATUSES.notConnected,
          lastSyncedAt: null,
          errorMessage: null,
        },
    counts: {
      observations: observations.length,
      baselines: baselines.length,
      summaries: summaries.length,
      alerts: alerts.length,
      appointments: appointments.length,
      dataSources: dataSources.length,
    },
  }
}
