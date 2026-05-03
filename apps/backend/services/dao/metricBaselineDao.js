/**
 * DAO for the `metric_baselines` table.
 *
 * One row per `(care_recipient_id, metric_type, window_days)` tuple,
 * recomputed nightly by the Phase 4B job from `health_observations`.
 * Phase 4 only reads from this table; UPSERT logic lands with the job.
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
 * Idempotent migration for `metric_baselines`. Must run after
 * `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureMetricBaselineSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_UNIQUE_SQL)
}
