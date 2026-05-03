import { parseDataSourceListQuery } from "../lib/data-sources.js"
import {
  fetchDataSourcesForRecipient,
  ensureCareRecipientDataSourceSchema,
} from "./dao/careRecipientDataSourceDao.js"

/**
 * List data-source registry rows for a care recipient.
 *
 * The route handler MUST call `requireCareRecipientAccess` first; this
 * service is RBAC-agnostic so the Phase 4A HealthKit sync path can
 * reuse it for self-checks after upserting a registry row.
 */
export async function listDataSourcesForRecipient(pool, recipientId, query) {
  const filters = parseDataSourceListQuery(query)
  const rows = await fetchDataSourcesForRecipient(pool, recipientId, filters)
  return { dataSources: rows }
}

/**
 * Run the idempotent schema migration for `care_recipient_data_sources`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureCareRecipientDataSourceSchema(pool)
}
