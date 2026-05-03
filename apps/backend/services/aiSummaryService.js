import { parseSummaryListQuery, SUMMARY_TYPES } from "../lib/ai-summaries.js"
import {
  buildStructuredSummaryInput,
  SUMMARY_DEFAULT_WINDOW_DAYS,
} from "../lib/ai-summary-input.js"
import { generateTemplateDailySummary } from "../lib/ai-summary-template.js"
import { windowStartIso } from "../lib/baseline-stats.js"
import { MAX_LIST_LIMIT } from "../lib/health-observations.js"
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "../lib/audit.js"
import {
  fetchSummariesForRecipient,
  insertSummary,
  ensureAiSummarySchema,
} from "./dao/aiSummaryDao.js"
import { fetchObservationsForRecipient } from "./dao/healthObservationDao.js"
import { fetchBaselinesForRecipient } from "./dao/metricBaselineDao.js"
import { fetchAllCareRecipientIds } from "./dao/careRecipientDao.js"
import { logAction } from "./auditService.js"

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
 * Generate a daily AI summary for a single recipient and persist it.
 *
 * Steps:
 *   1. Read recent observations (within the summary window) and the
 *      current baselines for this recipient.
 *   2. Shape both into the minimized `StructuredSummaryInput` envelope
 *      via `buildStructuredSummaryInput` — this is the single seam
 *      that decides what the generator sees. No raw HealthKit, no
 *      raw FHIR, no free-text.
 *   3. Hand the envelope to the injected `generator` (defaults to the
 *      deterministic template generator). Provider switch happens
 *      here; the rest of the pipeline never has to know.
 *   4. Persist the resulting row via `insertSummary`.
 *
 * Returns a slim envelope the caller can audit (counts + ids only —
 * never the summary text).
 *
 * **AI safety notes** (per `narthecare-general-healthcare.mdc`):
 *   - The generator's input and output ARE PHI. They live behind the
 *     same Cognito + care-team gate as every other care-recipient
 *     resource. They MUST NEVER reach `console.log` / `audit_logs.metadata`.
 *   - The template default has no LLM round-trip. A future Anthropic-
 *     backed generator must wrap its API call in a no-PHI-in-logs
 *     transport and add timeouts / retries before swapping in here.
 */
export async function generateDailySummaryForRecipient(
  pool,
  recipientId,
  {
    now = new Date(),
    windowDays = SUMMARY_DEFAULT_WINDOW_DAYS,
    generator = generateTemplateDailySummary,
    audit = true,
  } = {},
) {
  const since = windowStartIso(now, windowDays)
  const observations = await fetchObservationsForRecipient(pool, recipientId, {
    since,
    limit: MAX_LIST_LIMIT,
  })
  const baselines = await fetchBaselinesForRecipient(pool, recipientId, {})
  const input = buildStructuredSummaryInput({
    recipientId,
    observations,
    baselines,
    now,
    windowDays,
  })

  const generated = await generator(input)
  if (
    generated == null ||
    typeof generated !== "object" ||
    typeof generated.summary_text !== "string"
  ) {
    throw new Error("AI summary generator returned an invalid envelope")
  }

  const row = await insertSummary(pool, {
    careRecipientId: recipientId,
    summaryType: SUMMARY_TYPES.daily,
    summaryText: generated.summary_text,
    evidence: generated.evidence ?? null,
    recommendedActions: generated.recommended_actions ?? null,
    model: generated.model ?? null,
    promptVersion: generated.prompt_version ?? null,
    generatedAt: input.generatedAt,
    sourceWindowStart: input.sourceWindowStart,
    sourceWindowEnd: input.sourceWindowEnd,
    metadata: null,
  })

  if (audit) {
    await logAction(pool, {
      actorUserId: null,
      action: AUDIT_ACTIONS.generateAiSummary,
      resourceType: AUDIT_RESOURCE_TYPES.aiSummary,
      resourceId: recipientId,
      // Counts + generator identity only — never the summary text,
      // evidence ids, or any input value. The model + promptVersion
      // are part of the audit so a regression in copy can be tied to
      // the generator that produced it.
      metadata: {
        summaryType: row.summary_type,
        model: row.model,
        promptVersion: row.prompt_version,
        observationCount: observations.length,
        baselineCount: baselines.length,
      },
      ipAddress: null,
      userAgent: null,
    })
  }

  return {
    careRecipientId: recipientId,
    summaryId: row.id,
    summaryType: row.summary_type,
    model: row.model,
    promptVersion: row.prompt_version,
    generatedAt: row.generated_at,
    observationCount: observations.length,
    baselineCount: baselines.length,
  }
}

/**
 * Sweep every recipient and generate a daily summary for each.
 *
 * Sequential by design — keeps the DB pool usage bounded on the cron
 * host. Per-recipient errors are surfaced through `errors[]` and the
 * sweep continues; a single bad recipient must never abort a nightly
 * job. The error payload deliberately carries only a recipient id and
 * a stringified message — never the structured input envelope (which
 * is PHI).
 */
export async function generateDailySummariesForAllRecipients(
  pool,
  {
    now = new Date(),
    windowDays = SUMMARY_DEFAULT_WINDOW_DAYS,
    generator = generateTemplateDailySummary,
    onRecipient = null,
  } = {},
) {
  const recipientIds = await fetchAllCareRecipientIds(pool)
  let recipientsProcessed = 0
  let summariesWritten = 0
  const errors = []

  for (const recipientId of recipientIds) {
    try {
      const result = await generateDailySummaryForRecipient(pool, recipientId, {
        now,
        windowDays,
        generator,
      })
      recipientsProcessed += 1
      summariesWritten += 1
      if (typeof onRecipient === "function") {
        await onRecipient(result)
      }
    } catch (err) {
      console.error("[jobs generate-daily-summaries]", {
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
    summariesWritten,
    errors,
  }
}

/**
 * Run the idempotent schema migration for `ai_summaries`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureAiSummarySchema(pool)
}
