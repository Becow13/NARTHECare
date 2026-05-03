import { parseSummaryListQuery } from "../lib/ai-summaries.js"
import {
  fetchSummariesForRecipient,
  ensureAiSummarySchema,
} from "./dao/aiSummaryDao.js"

/**
 * List AI summaries for a care recipient, newest-first.
 *
 * The route handler MUST call `requireCareRecipientAccess` before this
 * function — the service is RBAC-agnostic so the Phase 4B pipeline can
 * reuse it for self-auditing reads after generation.
 */
export async function listSummariesForRecipient(pool, recipientId, query) {
  const filters = parseSummaryListQuery(query)
  const rows = await fetchSummariesForRecipient(pool, recipientId, filters)
  return { summaries: rows }
}

/**
 * Run the idempotent schema migration for `ai_summaries`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureAiSummarySchema(pool)
}
