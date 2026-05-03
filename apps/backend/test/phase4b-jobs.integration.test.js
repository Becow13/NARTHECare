import test from "node:test"
import assert from "node:assert/strict"
import {
  metricBaselineService,
  alertService,
  aiSummaryService,
} from "../services/index.js"
import {
  TEMPLATE_GENERATOR_MODEL,
  TEMPLATE_PROMPT_VERSION,
} from "../lib/ai-summary-template.js"

// ─── Test harness ────────────────────────────────────────────────────────────
//
// Phase 4B ships three background-job pipelines (baseline recompute,
// alert engine, AI summary generation). The fake pool below understands
// only the SQL these pipelines emit:
//   - SELECT id FROM care_recipients ORDER BY created_at ASC
//   - SELECT value_numeric FROM health_observations ... (window scan)
//   - SELECT ... FROM health_observations ... (latest-N read for the
//     alert engine + AI summary input shaping)
//   - SELECT ... FROM metric_baselines ... (no filters — service reads
//     every baseline for the recipient)
//   - INSERT INTO metric_baselines ... ON CONFLICT ... DO UPDATE
//   - INSERT INTO alerts ... ON CONFLICT DO NOTHING (batched in a tx)
//   - INSERT INTO ai_summaries ... RETURNING ...
//   - INSERT INTO audit_logs ... (per-recipient job audit)
//
// Any unhandled SQL throws so an accidental new query in production
// code surfaces loudly here. Tests assert behavior at the service
// boundary — none spin up Express, since the jobs are entry-point
// scripts that run outside the HTTP path.

const NOW = new Date("2026-04-25T12:00:00.000Z")

function createFakePool() {
  const state = {
    careRecipients: [],
    healthObservations: [],
    metricBaselines: [],
    aiSummaries: [],
    alerts: [],
    auditLogs: [],
    idCounter: 0,
  }
  const nextId = () => {
    state.idCounter += 1
    return `00000000-0000-4000-8000-${String(state.idCounter).padStart(12, "0")}`
  }

  async function execute(sql, params = []) {
    const s = sql.trim()
    if (s.startsWith("CREATE ") || s.startsWith("ALTER ")) return { rows: [] }
    if (s.startsWith("DO ")) return { rows: [] }
    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
      return { rows: [] }
    }

    // ── care_recipients ────────────────────────────────────────────────
    if (s.startsWith("SELECT id\n  FROM care_recipients")) {
      return { rows: state.careRecipients.map((r) => ({ id: r.id })) }
    }

    // ── health_observations: full-window value scan (baseline job) ─────
    if (
      s.startsWith("SELECT value_numeric") &&
      s.includes("FROM health_observations")
    ) {
      const [recipientId, metricType, since] = params
      const rows = state.healthObservations
        .filter(
          (r) =>
            r.care_recipient_id === recipientId &&
            r.metric_type === metricType &&
            r.value_numeric != null &&
            new Date(r.observed_at) >= new Date(since),
        )
        .sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at))
        .map((r) => ({ value_numeric: r.value_numeric }))
      return { rows }
    }

    // ── health_observations: latest-N read (alert + summary) ────────────
    if (s.includes("FROM health_observations")) {
      let recipientId = params[0]
      let rows = state.healthObservations.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("metric_type = $2")) {
        const metric = params[1]
        rows = rows.filter((r) => r.metric_type === metric)
        if (s.includes("observed_at >= $3")) {
          const since = params[2]
          rows = rows.filter((r) => new Date(r.observed_at) >= new Date(since))
        }
      } else if (s.includes("observed_at >= $2")) {
        const since = params[1]
        rows = rows.filter((r) => new Date(r.observed_at) >= new Date(since))
      }
      rows = [...rows].sort(
        (a, b) => new Date(b.observed_at) - new Date(a.observed_at),
      )
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }

    // ── metric_baselines: UPSERT ───────────────────────────────────────
    if (s.startsWith("INSERT INTO metric_baselines")) {
      const [
        recipientId,
        metricType,
        windowDays,
        p10,
        p50,
        p90,
        sampleCount,
        computedAt,
        metadata,
      ] = params
      let row = state.metricBaselines.find(
        (r) =>
          r.care_recipient_id === recipientId &&
          r.metric_type === metricType &&
          r.window_days === windowDays,
      )
      if (row) {
        row.p10_numeric = p10
        row.p50_numeric = p50
        row.p90_numeric = p90
        row.sample_count = sampleCount
        row.computed_at = computedAt
        row.metadata = metadata
        row.updated_at = new Date()
      } else {
        row = {
          id: nextId(),
          care_recipient_id: recipientId,
          metric_type: metricType,
          window_days: windowDays,
          p10_numeric: p10,
          p50_numeric: p50,
          p90_numeric: p90,
          sample_count: sampleCount,
          computed_at: computedAt,
          metadata,
          created_at: new Date(),
          updated_at: new Date(),
        }
        state.metricBaselines.push(row)
      }
      return { rows: [row] }
    }

    // ── metric_baselines: read (alert engine + summary input) ──────────
    if (s.includes("FROM metric_baselines")) {
      let [recipientId] = params
      let rows = state.metricBaselines.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("metric_type = $2") && s.includes("window_days = $3")) {
        const [, metric, window] = params
        rows = rows.filter(
          (r) => r.metric_type === metric && r.window_days === window,
        )
      } else if (s.includes("metric_type = $2")) {
        const [, metric] = params
        rows = rows.filter((r) => r.metric_type === metric)
      } else if (s.includes("window_days = $2")) {
        const [, window] = params
        rows = rows.filter((r) => r.window_days === window)
      }
      return { rows }
    }

    // ── alerts: batched INSERT with ON CONFLICT DO NOTHING ─────────────
    if (s.startsWith("INSERT INTO alerts")) {
      const [
        recipientId,
        severity,
        category,
        title,
        explanation,
        status,
        observedAt,
        sourceType,
        sourceRecordId,
        metadata,
      ] = params
      const conflict =
        sourceRecordId &&
        state.alerts.some(
          (r) =>
            r.source_type === sourceType &&
            r.source_record_id === sourceRecordId,
        )
      if (conflict) return { rows: [] }
      const row = {
        id: nextId(),
        care_recipient_id: recipientId,
        severity,
        category,
        title,
        explanation,
        status,
        observed_at: observedAt,
        source_type: sourceType,
        source_record_id: sourceRecordId,
        metadata,
        created_at: new Date(),
        resolved_at: null,
      }
      state.alerts.push(row)
      return { rows: [{ id: row.id }] }
    }

    // ── ai_summaries: INSERT ──────────────────────────────────────────
    if (s.startsWith("INSERT INTO ai_summaries")) {
      const [
        recipientId,
        summaryType,
        summaryText,
        evidence,
        recommendedActions,
        model,
        promptVersion,
        generatedAt,
        sourceWindowStart,
        sourceWindowEnd,
        metadata,
      ] = params
      const row = {
        id: nextId(),
        care_recipient_id: recipientId,
        summary_type: summaryType,
        summary_text: summaryText,
        evidence,
        recommended_actions: recommendedActions,
        model,
        prompt_version: promptVersion,
        generated_at: generatedAt,
        source_window_start: sourceWindowStart,
        source_window_end: sourceWindowEnd,
        metadata,
        created_at: new Date(),
      }
      state.aiSummaries.push(row)
      return { rows: [row] }
    }

    // ── audit_logs ─────────────────────────────────────────────────────
    if (s.startsWith("INSERT INTO audit_logs")) {
      const [actor, action, resourceType, resourceId, metadata, ip, ua] = params
      const row = {
        id: nextId(),
        actor_user_id: actor,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
        ip_address: ip,
        user_agent: ua,
        created_at: new Date(),
      }
      state.auditLogs.push(row)
      return { rows: [{ id: row.id }] }
    }

    throw new Error(`Fake pool: unhandled SQL: ${s.slice(0, 120)}`)
  }

  const pool = {
    async query(sql, params) {
      return execute(sql, params)
    },
    async connect() {
      return { query: execute, release() {} }
    },
  }
  return { pool, state, nextId }
}

function seedRecipient(state, nextId) {
  const id = nextId()
  state.careRecipients.push({
    id,
    name: "Test Recipient",
    date_of_birth: null,
    primary_condition: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  })
  return id
}

function seedObservations(state, nextId, recipientId, samples) {
  for (const s of samples) {
    state.healthObservations.push({
      id: nextId(),
      care_recipient_id: recipientId,
      metric_type: s.metric_type,
      value_numeric: s.value_numeric,
      value_unit: s.value_unit ?? "bpm",
      observed_at: s.observed_at,
      source_type: s.source_type ?? "healthkit",
      source_id: null,
      source_record_id: s.source_record_id ?? null,
      metadata: null,
      created_at: new Date(),
    })
  }
}

// ─── Pillar 1 — Baseline recompute ──────────────────────────────────────────

test("recomputeBaselinesForAllRecipients upserts one row per (recipient × metric × window)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  // Six daily resting-HR readings — enough for percentile gate.
  const obs = [60, 62, 65, 68, 70, 72].map((v, i) => ({
    metric_type: "resting_heart_rate",
    value_numeric: v,
    value_unit: "bpm",
    observed_at: new Date(NOW.getTime() - i * 24 * 60 * 60 * 1000).toISOString(),
  }))
  seedObservations(state, nextId, recipientId, obs)

  const result = await metricBaselineService.recomputeBaselinesForAllRecipients(
    pool,
    { now: NOW },
  )
  assert.equal(result.recipientCount, 1)
  assert.equal(result.recipientsProcessed, 1)
  // 7 baseline metrics × 3 windows = 21 baseline rows per recipient.
  assert.equal(result.baselinesUpserted, 21)
  // No per-recipient errors.
  assert.deepEqual(result.errors, [])

  const restingHR14 = state.metricBaselines.find(
    (r) =>
      r.care_recipient_id === recipientId &&
      r.metric_type === "resting_heart_rate" &&
      r.window_days === 14,
  )
  assert.ok(restingHR14, "resting_heart_rate × 14d baseline written")
  assert.equal(restingHR14.sample_count, 6)
  assert.ok(Number.isFinite(restingHR14.p10_numeric))
  assert.ok(Number.isFinite(restingHR14.p50_numeric))
  assert.ok(Number.isFinite(restingHR14.p90_numeric))
  assert.equal(restingHR14.computed_at, NOW.toISOString())
})

test("recomputeBaselinesForRecipient writes a counts-only audit row (no PHI)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  await metricBaselineService.recomputeBaselinesForRecipient(pool, recipientId, {
    now: NOW,
  })
  const audit = state.auditLogs.find(
    (a) => a.action === "RECOMPUTE_METRIC_BASELINES",
  )
  assert.ok(audit, "RECOMPUTE_METRIC_BASELINES audit row written")
  assert.equal(audit.actor_user_id, null) // job, no user
  assert.equal(audit.resource_id, recipientId)
  // Counts only — no percentile values, no recipient names, no metric values.
  assert.deepEqual(Object.keys(audit.metadata).sort(), [
    "baselinesUpserted",
    "baselinesWithPercentiles",
    "metricCount",
    "windowCount",
  ])
})

test("recompute is idempotent — second run updates existing rows in place", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  await metricBaselineService.recomputeBaselinesForAllRecipients(pool, { now: NOW })
  const firstCount = state.metricBaselines.length
  await metricBaselineService.recomputeBaselinesForAllRecipients(pool, { now: NOW })
  assert.equal(state.metricBaselines.length, firstCount)
})

test("a per-recipient failure does not abort the sweep", async () => {
  const { pool, state, nextId } = createFakePool()
  const goodId = seedRecipient(state, nextId)
  const badId = seedRecipient(state, nextId)
  const originalQuery = pool.query
  pool.query = async (sql, params) => {
    // Inject a single transient failure for one recipient's first
    // observation read (the baseline window scan), then restore.
    const trimmed = sql.trim()
    if (
      trimmed.startsWith("SELECT value_numeric") &&
      trimmed.includes("FROM health_observations") &&
      params[0] === badId
    ) {
      pool.query = originalQuery
      throw new Error("transient db hiccup")
    }
    return originalQuery.call(pool, sql, params)
  }
  const result = await metricBaselineService.recomputeBaselinesForAllRecipients(
    pool,
    { now: NOW },
  )
  // Both recipients counted; one processed cleanly, one error surfaced.
  assert.equal(result.recipientCount, 2)
  assert.equal(result.recipientsProcessed, 1)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].recipientId, badId)
  assert.ok(state.metricBaselines.some((r) => r.care_recipient_id === goodId))
})

// ─── Pillar 2 — Alert engine ────────────────────────────────────────────────

test("evaluateAlertsForAllRecipients writes alerts derived from rule excursions", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  // Latest resting HR is 95 — above the 14-day baseline's p90 (72).
  seedObservations(state, nextId, recipientId, [
    {
      metric_type: "resting_heart_rate",
      value_numeric: 95,
      value_unit: "bpm",
      observed_at: NOW.toISOString(),
    },
  ])
  state.metricBaselines.push({
    id: nextId(),
    care_recipient_id: recipientId,
    metric_type: "resting_heart_rate",
    window_days: 14,
    p10_numeric: 60,
    p50_numeric: 65,
    p90_numeric: 72,
    sample_count: 18,
    computed_at: NOW.toISOString(),
    metadata: null,
  })

  const result = await alertService.evaluateAlertsForAllRecipients(pool, { now: NOW })
  assert.equal(result.recipientsProcessed, 1)
  assert.equal(result.alertsAccepted, 1)
  assert.equal(result.alertsDeduped, 0)

  const alert = state.alerts.find(
    (a) => a.care_recipient_id === recipientId,
  )
  assert.ok(alert, "alert row inserted")
  assert.equal(alert.severity, "monitor")
  assert.equal(alert.category, "resting_heart_rate.elevated")
  assert.equal(alert.source_type, "rule_engine")
  // Title is caregiver-safe — no diagnosis verb.
  assert.doesNotMatch(alert.title, /\bdiagnose[ds]?\b/i)
})

test("re-running the alert engine on the same evidence dedupes (accepted=0)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  seedObservations(state, nextId, recipientId, [
    {
      metric_type: "resting_heart_rate",
      value_numeric: 95,
      value_unit: "bpm",
      observed_at: NOW.toISOString(),
    },
  ])
  state.metricBaselines.push({
    id: nextId(),
    care_recipient_id: recipientId,
    metric_type: "resting_heart_rate",
    window_days: 14,
    p10_numeric: 60,
    p50_numeric: 65,
    p90_numeric: 72,
    sample_count: 18,
    computed_at: NOW.toISOString(),
    metadata: null,
  })

  const first = await alertService.evaluateAlertsForRecipient(pool, recipientId, {
    now: NOW,
  })
  assert.equal(first.accepted, 1)
  assert.equal(first.deduped, 0)

  const second = await alertService.evaluateAlertsForRecipient(pool, recipientId, {
    now: NOW,
  })
  assert.equal(second.accepted, 0)
  assert.equal(second.deduped, 1)
  assert.equal(state.alerts.length, 1)
})

test("evaluateAlertsForRecipient writes a counts + categories audit row (no PHI titles)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  seedObservations(state, nextId, recipientId, [
    {
      metric_type: "spo2",
      value_numeric: 88,
      value_unit: "percent",
      observed_at: NOW.toISOString(),
    },
  ])
  await alertService.evaluateAlertsForRecipient(pool, recipientId, { now: NOW })
  const audit = state.auditLogs.find((a) => a.action === "EVALUATE_ALERTS")
  assert.ok(audit, "EVALUATE_ALERTS audit row written")
  assert.equal(audit.actor_user_id, null)
  assert.equal(audit.resource_id, recipientId)
  assert.deepEqual(Object.keys(audit.metadata).sort(), [
    "accepted",
    "candidates",
    "categories",
    "deduped",
  ])
  // Categories list is the rule-engine vocabulary — never alert titles.
  for (const c of audit.metadata.categories) {
    assert.doesNotMatch(c, /\s/) // category strings are dotted ids, no spaces
  }
})

// ─── Pillar 3 — AI summary generation ───────────────────────────────────────

test("generateDailySummariesForAllRecipients writes one summary per recipient via the template generator", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientA = seedRecipient(state, nextId)
  const recipientB = seedRecipient(state, nextId)
  seedObservations(state, nextId, recipientA, [
    {
      metric_type: "resting_heart_rate",
      value_numeric: 70,
      value_unit: "bpm",
      observed_at: NOW.toISOString(),
    },
  ])
  // recipientB has no observations — the summary should still write,
  // surfacing the honest empty state in the body.

  const result = await aiSummaryService.generateDailySummariesForAllRecipients(
    pool,
    { now: NOW },
  )
  assert.equal(result.recipientCount, 2)
  assert.equal(result.recipientsProcessed, 2)
  assert.equal(result.summariesWritten, 2)

  const aSummary = state.aiSummaries.find(
    (r) => r.care_recipient_id === recipientA,
  )
  const bSummary = state.aiSummaries.find(
    (r) => r.care_recipient_id === recipientB,
  )
  assert.ok(aSummary)
  assert.ok(bSummary)
  for (const row of [aSummary, bSummary]) {
    assert.equal(row.summary_type, "daily")
    assert.equal(row.model, TEMPLATE_GENERATOR_MODEL)
    assert.equal(row.prompt_version, TEMPLATE_PROMPT_VERSION)
    // Generator output is deterministic + caregiver-safe.
    assert.match(row.summary_text, /Daily care summary/)
    assert.doesNotMatch(row.summary_text, /\bdiagnose[ds]?\b/i)
  }
  assert.match(bSummary.summary_text, /No new readings/)
})

test("generateDailySummaryForRecipient writes a counts + generator-identity audit row (no summary text)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  await aiSummaryService.generateDailySummaryForRecipient(pool, recipientId, {
    now: NOW,
  })
  const audit = state.auditLogs.find((a) => a.action === "GENERATE_AI_SUMMARY")
  assert.ok(audit, "GENERATE_AI_SUMMARY audit row written")
  assert.equal(audit.actor_user_id, null)
  assert.equal(audit.resource_id, recipientId)
  assert.deepEqual(Object.keys(audit.metadata).sort(), [
    "baselineCount",
    "model",
    "observationCount",
    "promptVersion",
    "summaryType",
  ])
  assert.equal(audit.metadata.model, TEMPLATE_GENERATOR_MODEL)
  assert.equal(audit.metadata.promptVersion, TEMPLATE_PROMPT_VERSION)
})

test("custom generator is honored via DI (lets a future Anthropic adapter swap in)", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  let receivedInput = null
  const customGenerator = async (input) => {
    receivedInput = input
    return {
      summary_text: "custom generator output",
      evidence: { generator: "custom" },
      recommended_actions: { actions: ["custom action"] },
      model: "custom-model-1",
      prompt_version: "custom-v1",
    }
  }
  await aiSummaryService.generateDailySummaryForRecipient(pool, recipientId, {
    now: NOW,
    generator: customGenerator,
  })
  assert.ok(receivedInput, "custom generator received the structured input")
  // Structured input shape — no raw HealthKit dump.
  assert.equal(receivedInput.careRecipientId, recipientId)
  assert.ok(Array.isArray(receivedInput.metrics))

  const row = state.aiSummaries.find((r) => r.care_recipient_id === recipientId)
  assert.equal(row.summary_text, "custom generator output")
  assert.equal(row.model, "custom-model-1")
  assert.equal(row.prompt_version, "custom-v1")
})

test("a generator that returns an invalid envelope rejects without writing a row", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  const badGenerator = async () => ({ not_summary_text: "wrong shape" })
  await assert.rejects(
    aiSummaryService.generateDailySummaryForRecipient(pool, recipientId, {
      now: NOW,
      generator: badGenerator,
    }),
    /invalid envelope/,
  )
  assert.equal(
    state.aiSummaries.filter((r) => r.care_recipient_id === recipientId).length,
    0,
  )
})

// ─── Cross-pillar — full nightly ordering ──────────────────────────────────

test("baselines → alerts → summaries pipeline composes end-to-end", async () => {
  const { pool, state, nextId } = createFakePool()
  const recipientId = seedRecipient(state, nextId)
  // 14 daily resting-HR readings clustered 60–70, plus a fresh 95.
  const samples = Array.from({ length: 14 }, (_, i) => ({
    metric_type: "resting_heart_rate",
    value_numeric: 60 + (i % 11),
    value_unit: "bpm",
    observed_at: new Date(
      NOW.getTime() - (i + 1) * 24 * 60 * 60 * 1000,
    ).toISOString(),
  }))
  seedObservations(state, nextId, recipientId, [
    ...samples,
    {
      metric_type: "resting_heart_rate",
      value_numeric: 95,
      value_unit: "bpm",
      observed_at: NOW.toISOString(),
    },
  ])

  await metricBaselineService.recomputeBaselinesForAllRecipients(pool, { now: NOW })
  const alertResult = await alertService.evaluateAlertsForAllRecipients(pool, {
    now: NOW,
  })
  const summaryResult =
    await aiSummaryService.generateDailySummariesForAllRecipients(pool, {
      now: NOW,
    })

  assert.ok(alertResult.alertsAccepted >= 1, "at least one alert fired")
  assert.equal(summaryResult.summariesWritten, 1)
  // The summary input pulled the same baselines the alert engine used.
  const summary = state.aiSummaries[0]
  assert.match(summary.summary_text, /Resting heart rate/)
  // Evidence cites real ids — never raw values.
  assert.ok(Array.isArray(summary.evidence.observationIds))
  assert.ok(summary.evidence.observationIds.length >= 1)
})
