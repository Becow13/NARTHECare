/**
 * DAO for the `metric_baselines` table.
 *
 * One row per `(care_recipient_id, metric_type, window_days)` tuple,
 * recomputed nightly by the Phase 4B job from `health_observations`.
 * Phase 4 ships the read surface; Phase 4B adds `upsertBaseline` keyed
 * on the partial UNIQUE `(care_recipient_id, metric_type, window_days)`
 * declared below so the job can recompute idempotently.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS metric_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    p10_numeric DOUBLE PRECISION,
    p50_numeric DOUBLE PRECISION,
    p90_numeric DOUBLE PRECISION,
    sample_count INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

// One baseline per (recipient, metric, window) — the nightly recompute
// job uses this for ON CONFLICT in Phase 4B.
const CREATE_INDEX_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS metric_baselines_recipient_metric_window_uidx
    ON metric_baselines (care_recipient_id, metric_type, window_days);
`

const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, metric_type, window_days,
         p10_numeric, p50_numeric, p90_numeric,
         sample_count, computed_at, metadata,
         created_at, updated_at
    FROM metric_baselines
`

const SELECT_BY_RECIPIENT_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY metric_type ASC, window_days ASC;
`

const SELECT_BY_RECIPIENT_METRIC_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2
   ORDER BY window_days ASC;
`

const SELECT_BY_RECIPIENT_WINDOW_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND window_days = $2
   ORDER BY metric_type ASC;
`

const SELECT_BY_RECIPIENT_METRIC_WINDOW_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2 AND window_days = $3
   LIMIT 1;
`

// Phase 4B — single-row UPSERT used by the nightly baseline job.
// `ON CONFLICT (care_recipient_id, metric_type, window_days)` reuses
// the existing UNIQUE index above so the recompute is naturally
// idempotent: re-running on the same window just refreshes the row.
// `computed_at` is overwritten (the job stamps "when it last ran"),
// `updated_at` is bumped via NOW(), and `created_at` stays at the
// first-ever recompute for this tuple.
const UPSERT_BASELINE_SQL = `
  INSERT INTO metric_baselines (
    care_recipient_id,
    metric_type,
    window_days,
    p10_numeric,
    p50_numeric,
    p90_numeric,
    sample_count,
    computed_at,
    metadata
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (care_recipient_id, metric_type, window_days)
  DO UPDATE SET
    p10_numeric = EXCLUDED.p10_numeric,
    p50_numeric = EXCLUDED.p50_numeric,
    p90_numeric = EXCLUDED.p90_numeric,
    sample_count = EXCLUDED.sample_count,
    computed_at = EXCLUDED.computed_at,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id, care_recipient_id, metric_type, window_days,
            p10_numeric, p50_numeric, p90_numeric, sample_count,
            computed_at, metadata, created_at, updated_at;
`

/**
 * List baselines for a single care recipient.
 *
 * Filters narrow the result without ever opening the partition key —
 * even with `metricType` set the query still pins `care_recipient_id`.
 */
export async function fetchBaselinesForRecipient(
  pool,
  recipientId,
  { metricType = null, windowDays = null } = {},
) {
  if (metricType && windowDays != null) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_WINDOW_SQL, [
      recipientId,
      metricType,
      windowDays,
    ])
    return rows
  }
  if (metricType) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_SQL, [
      recipientId,
      metricType,
    ])
    return rows
  }
  if (windowDays != null) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_WINDOW_SQL, [
      recipientId,
      windowDays,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_SQL, [recipientId])
  return rows
}

/**
 * Upsert one baseline row for a `(recipient, metric, window)` tuple.
 *
 * The Phase 4B job calls this once per combination it computes. Null
 * percentiles are persisted as NULL (vs deleted rows) so the read
 * endpoint can show "X readings collected, baseline pending" without a
 * second query — the same row carries `sample_count` regardless of
 * whether the percentile gate (`MIN_SAMPLES_FOR_PERCENTILES`) was met.
 *
 * `computedAt` is passed in by the caller so a job run with a single
 * reference clock stamps the same value across every row, which makes
 * "did the nightly job actually run?" trivial to spot in ops queries.
 */
export async function upsertBaseline(
  pool,
  {
    careRecipientId,
    metricType,
    windowDays,
    p10,
    p50,
    p90,
    sampleCount,
    computedAt,
    metadata = null,
  },
) {
  const { rows } = await pool.query(UPSERT_BASELINE_SQL, [
    careRecipientId,
    metricType,
    windowDays,
    p10,
    p50,
    p90,
    sampleCount,
    computedAt,
    metadata,
  ])
  return rows[0]
}

/**
 * Idempotent migration for `metric_baselines`. Must run after
 * `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureMetricBaselineSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_UNIQUE_SQL)
}
