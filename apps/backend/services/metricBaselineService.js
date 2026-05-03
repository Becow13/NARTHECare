import { parseBaselineListQuery } from "../lib/metric-baselines.js"
import { METRIC_TYPES } from "../lib/health-observations.js"
import {
  BASELINE_METRIC_TYPES,
  BASELINE_WINDOWS,
  computeBaseline,
  windowStartIso,
} from "../lib/baseline-stats.js"
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "../lib/audit.js"
import {
  fetchBaselinesForRecipient,
  upsertBaseline,
  ensureMetricBaselineSchema,
} from "./dao/metricBaselineDao.js"
import { fetchObservationValuesInWindow } from "./dao/healthObservationDao.js"
import { fetchAllCareRecipientIds } from "./dao/careRecipientDao.js"
import { logAction } from "./auditService.js"

/** Allowed metric_type strings — sourced once from the observations module. */
const ALLOWED_METRIC_TYPES = new Set(Object.values(METRIC_TYPES))

/**
 * List metric baselines for a care recipient.
 *
 * The route handler MUST gate on `requireCareRecipientAccess` first;
 * this service is RBAC-agnostic so the Phase 4B nightly recompute job
 * can reuse it for an internal sanity-check read.
 */
export async function listBaselinesForRecipient(pool, recipientId, query) {
  const filters = parseBaselineListQuery(query, ALLOWED_METRIC_TYPES)
  const rows = await fetchBaselinesForRecipient(pool, recipientId, filters)
  return { baselines: rows }
}

/**
 * Recompute every baseline (`metric × window`) for a single recipient.
 *
 * Reads `health_observations` for each (metric, window) tuple, folds
 * the values through `computeBaseline`, and upserts one row per tuple.
 * Returns an envelope with non-PHI counters the caller can audit.
 *
 * Background jobs only — no route handler calls this directly. The
 * service is RBAC-agnostic on purpose because the job loop (see
 * `recomputeBaselinesForAllRecipients` and the
 * `scripts/recompute-baselines.js` entry point) runs without a user
 * context. `now` is injected so a multi-recipient sweep stamps every
 * row with the same reference clock and tests stay deterministic.
 */
export async function recomputeBaselinesForRecipient(
  pool,
  recipientId,
  { now = new Date(), audit = true } = {},
) {
  const computedAt = _toIso(now)
  let baselinesUpserted = 0
  let baselinesWithPercentiles = 0

  for (const metricType of BASELINE_METRIC_TYPES) {
    for (const windowDays of BASELINE_WINDOWS) {
      const since = windowStartIso(now, windowDays)
      const values = await fetchObservationValuesInWindow(
        pool,
        recipientId,
        metricType,
        since,
      )
      const stats = computeBaseline(values)
      await upsertBaseline(pool, {
        careRecipientId: recipientId,
        metricType,
        windowDays,
        p10: stats.p10,
        p50: stats.p50,
        p90: stats.p90,
        sampleCount: stats.sampleCount,
        computedAt,
        metadata: null,
      })
      baselinesUpserted += 1
      if (stats.p50 != null) baselinesWithPercentiles += 1
    }
  }

  const result = {
    careRecipientId: recipientId,
    baselinesUpserted,
    baselinesWithPercentiles,
    metricCount: BASELINE_METRIC_TYPES.length,
    windowCount: BASELINE_WINDOWS.length,
    computedAt,
  }

  if (audit) {
    await logAction(pool, {
      actorUserId: null,
      action: AUDIT_ACTIONS.recomputeMetricBaselines,
      resourceType: AUDIT_RESOURCE_TYPES.metricBaseline,
      resourceId: recipientId,
      // Counts only — never percentile values, sample timestamps, or
      // recipient names. The metric set is the same fixed list the
      // job sweeps every time, so no PHI surface here.
      metadata: {
        baselinesUpserted,
        baselinesWithPercentiles,
        metricCount: BASELINE_METRIC_TYPES.length,
        windowCount: BASELINE_WINDOWS.length,
      },
      ipAddress: null,
      userAgent: null,
    })
  }

  return result
}

/**
 * Sweep every recipient and recompute their baselines.
 *
 * The sweep is sequential by design — a baseline recompute is cheap
 * per recipient and we'd rather take a few extra seconds than risk
 * hammering the DB pool from the cron host. Returns an envelope with
 * counters only; the caller audits one row per recipient (so a
 * recompute failure for one recipient does not hide the rest of the
 * sweep). Per-recipient errors are surfaced through `errors[]` and
 * the sweep continues — a single bad recipient must never abort a
 * nightly job.
 */
export async function recomputeBaselinesForAllRecipients(
  pool,
  { now = new Date(), onRecipient = null } = {},
) {
  const recipientIds = await fetchAllCareRecipientIds(pool)
  let recipientsProcessed = 0
  let baselinesUpserted = 0
  const errors = []

  for (const recipientId of recipientIds) {
    try {
      const result = await recomputeBaselinesForRecipient(pool, recipientId, {
        now,
      })
      recipientsProcessed += 1
      baselinesUpserted += result.baselinesUpserted
      if (typeof onRecipient === "function") {
        await onRecipient(result)
      }
    } catch (err) {
      // Log a tagged, PHI-free message and keep going. The recipient id
      // is an internal UUID, never PHI, so it is safe to surface here.
      console.error("[jobs recompute-baselines]", {
        recipientId,
        message: err instanceof Error ? err.message : String(err),
      })
      errors.push({ recipientId, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return {
    recipientCount: recipientIds.length,
    recipientsProcessed,
    baselinesUpserted,
    errors,
  }
}

/**
 * Run the idempotent schema migration for `metric_baselines`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureMetricBaselineSchema(pool)
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _toIso(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return new Date(value).toISOString()
  throw new Error("`now` must be a Date or ISO string")
}
