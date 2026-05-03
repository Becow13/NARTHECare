/**
 * DAO for the `health_observations` table.
 *
 * The table is the canonical store for every per-sample health signal
 * ingested from HealthKit, Epic, or manual entry. Phase 4 ships the
 * read surface; Phase 4A adds the write path (`POST /healthkit/sync`)
 * using `INSERT … ON CONFLICT (source_type, source_record_id) DO NOTHING`
 * for idempotent re-sync. Keep the schema here and the matching block
 * in `schema.sql` in lock-step.
 *
 * The pool is injected so this module is trivially testable with a
 * fake pg surface; no module-level state lives in this file.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS health_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    value_numeric DOUBLE PRECISION,
    value_unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_record_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

// Read path index — covers the dashboard's "latest N samples by metric"
// query without a sort.
const CREATE_INDEX_RECIPIENT_METRIC_OBSERVED_SQL = `
  CREATE INDEX IF NOT EXISTS health_observations_recipient_metric_observed_idx
    ON health_observations (care_recipient_id, metric_type, observed_at DESC);
`

// Idempotent ingest — Phase 4A relies on this UNIQUE for ON CONFLICT.
// Built here (not in the Phase 4A migration) so reads and writes share a
// single source of truth and a partial index re-create cannot diverge.
const CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS health_observations_source_record_uidx
    ON health_observations (source_type, source_record_id)
    WHERE source_record_id IS NOT NULL;
`

// All four query shapes share the same SELECT projection. Keeping them
// as four explicit statements (rather than a dynamic builder) makes the
// fake-pool tests pattern-match one literal each — no string fuzziness.
const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, metric_type, value_numeric, value_unit,
         observed_at, source_type, source_id, source_record_id, metadata,
         created_at
    FROM health_observations
`

const SELECT_BY_RECIPIENT_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY observed_at DESC
   LIMIT $2;
`

const SELECT_BY_RECIPIENT_METRIC_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_SINCE_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND observed_at >= $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_METRIC_SINCE_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2 AND observed_at >= $3
   ORDER BY observed_at DESC
   LIMIT $4;
`

// Phase 4B — full-window scan used by the nightly baseline recompute
// job. Returns the bare `value_numeric` column ordered by `observed_at`
// ASC so the caller can stream values into the percentile helper
// without an in-memory sort. No row limit — the caller has already
// scoped by recipient + metric_type + window, so the natural cap is the
// 30-day batch size for the deepest baseline window. Out-of-range or
// `value_numeric IS NULL` rows are filtered server-side so the pure
// stats helper never has to defend against half-formed observations.
const SELECT_VALUES_IN_WINDOW_SQL = `
  SELECT value_numeric
    FROM health_observations
   WHERE care_recipient_id = $1
     AND metric_type = $2
     AND observed_at >= $3
     AND value_numeric IS NOT NULL
   ORDER BY observed_at ASC;
`

// Phase 4A — single-row INSERT used by `insertObservationsBatch`.
// `ON CONFLICT … DO NOTHING` is the load-bearing line: re-syncing the
// same sample window is silently deduped against the partial UNIQUE
// `(source_type, source_record_id) WHERE source_record_id IS NOT NULL`,
// so the iOS client may safely retry after a crash, network loss, or
// reinstall. `RETURNING id` lets the caller count "actually inserted"
// vs "deduped" without a follow-up SELECT.
const INSERT_OBSERVATION_SQL = `
  INSERT INTO health_observations (
    care_recipient_id,
    metric_type,
    value_numeric,
    value_unit,
    observed_at,
    source_type,
    source_id,
    source_record_id,
    metadata
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (source_type, source_record_id) DO NOTHING
  RETURNING id;
`

/**
 * List observations for a single care recipient, newest-first.
 *
 * Filters are layered server-side so a non-member can never see a row
 * even if the route forgot the access gate (the access gate is the
 * primary defense; this is a defense-in-depth backstop). Returns an
 * empty array when no rows match — never throws on emptiness.
 */
export async function fetchObservationsForRecipient(
  pool,
  recipientId,
  { metricType = null, since = null, limit },
) {
  if (metricType && since) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_SINCE_SQL, [
      recipientId,
      metricType,
      since,
      limit,
    ])
    return rows
  }
  if (metricType) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_SQL, [
      recipientId,
      metricType,
      limit,
    ])
    return rows
  }
  if (since) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_SINCE_SQL, [
      recipientId,
      since,
      limit,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_SQL, [recipientId, limit])
  return rows
}

/**
 * Stream the numeric values for a (recipient, metric, window) tuple,
 * oldest-first.
 *
 * Phase 4B's nightly baseline job calls this once per
 * (recipient, metric, window) combo, then folds the values through
 * `lib/baseline-stats.computeBaseline`. Returning a bare number array
 * (not full observation rows) keeps the per-recipient memory footprint
 * tight even for 30-day windows of resting-HR-style continuous samples.
 */
export async function fetchObservationValuesInWindow(
  pool,
  recipientId,
  metricType,
  windowStart,
) {
  const { rows } = await pool.query(SELECT_VALUES_IN_WINDOW_SQL, [
    recipientId,
    metricType,
    windowStart,
  ])
  return rows.map((r) => Number(r.value_numeric))
}

/**
 * Insert a batch of observation rows for a single care recipient inside
 * one transaction.
 *
 * Returns `{ accepted, deduped }` — `accepted` is the number of rows
 * the partial UNIQUE accepted (newly stored), `deduped` is the number
 * silently dropped because the same `(source_type, source_record_id)`
 * pair was already present from a prior sync. `rejected` is computed
 * by the service layer (parser-stage failures never reach this
 * function), so the response totals match what the route handler
 * audits.
 *
 * The whole batch commits or rolls back together — partial writes are
 * not allowed because a half-applied sync window would silently
 * misreport progress on the next dedupe pass.
 */
export async function insertObservationsBatch(pool, recipientId, rows) {
  if (rows.length === 0) {
    return { accepted: 0, deduped: 0 }
  }

  const client = await pool.connect()
  let accepted = 0
  try {
    await client.query("BEGIN")
    for (const row of rows) {
      const result = await client.query(INSERT_OBSERVATION_SQL, [
        recipientId,
        row.metric_type,
        row.value_numeric,
        row.value_unit,
        row.observed_at,
        row.source_type,
        row.source_id,
        row.source_record_id,
        row.metadata,
      ])
      // ON CONFLICT DO NOTHING returns 0 rows for deduped inserts.
      if (result.rows.length > 0) accepted += 1
    }
    await client.query("COMMIT")
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {
      /* ignore — surface the original error */
    }
    throw err
  } finally {
    client.release()
  }

  return { accepted, deduped: rows.length - accepted }
}

/**
 * Idempotent migration for `health_observations` and its indexes.
 * Must run after `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureHealthObservationSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_METRIC_OBSERVED_SQL)
  await pool.query(CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL)
}
