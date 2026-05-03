import { parseBaselineListQuery } from "../lib/metric-baselines.js"
import { METRIC_TYPES } from "../lib/health-observations.js"
import {
  fetchBaselinesForRecipient,
  ensureMetricBaselineSchema,
} from "./dao/metricBaselineDao.js"

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
 * Run the idempotent schema migration for `metric_baselines`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureMetricBaselineSchema(pool)
}
