/**
 * DAO for the `appointments` table.
 *
 * Phase 4 only ships reads. Writes will land via:
 *   - manual caregiver entry (a future PATCH endpoint), and
 *   - Epic FHIR `Encounter` sync (Phase 6+) which will use
 *     `(source_type, source_record_id)` for idempotent re-ingest.
 *
 * The `time_window` filter is materialized in SQL via a comparison
 * against `NOW()` so the dashboard never has to bake "now" on the
 * client (avoids client/server clock drift driving wrong results).
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    location TEXT,
    provider_name TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    source_type TEXT,
    source_id TEXT,
    source_record_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

const CREATE_INDEX_RECIPIENT_SCHEDULED_SQL = `
  CREATE INDEX IF NOT EXISTS appointments_recipient_scheduled_idx
    ON appointments (care_recipient_id, scheduled_for ASC);
`

// Idempotent ingest from external sources (e.g. Epic Encounter); the
// partial unique index lets manual rows leave `source_record_id` NULL.
const CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS appointments_source_record_uidx
    ON appointments (source_type, source_record_id)
    WHERE source_record_id IS NOT NULL;
`

const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, title, location, provider_name,
         scheduled_for, status, source_type, source_id,
         source_record_id, metadata, created_at, updated_at
    FROM appointments
`

// `time_window` is rendered into the WHERE clause via one of three
// fixed predicates so the SQL is parameter-only. Each "upcoming" /
// "past" branch sorts ASC (next first) / DESC (most recent first) to
// match what a caregiver expects when scrolling either direction.

/**
 * List appointments for a single care recipient.
 *
 * Sort order depends on `timeWindow`:
 *   - `upcoming`: `scheduled_for ASC` so the next visit lands first.
 *   - `past` / `all`: `scheduled_for DESC`.
 */
export async function fetchAppointmentsForRecipient(
  pool,
  recipientId,
  { status = null, timeWindow = "all", limit },
) {
  const params = [recipientId]
  const where = ["care_recipient_id = $1"]

  if (status) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }

  let order = "scheduled_for DESC"
  if (timeWindow === "upcoming") {
    where.push("scheduled_for >= NOW()")
    order = "scheduled_for ASC"
  } else if (timeWindow === "past") {
    where.push("scheduled_for < NOW()")
    order = "scheduled_for DESC"
  }

  params.push(limit)
  const sql = `
    ${SELECT_BASE_PROJECTION}
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT $${params.length};
  `
  const { rows } = await pool.query(sql, params)
  return rows
}

/**
 * Idempotent migration for `appointments`. Must run after
 * `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureAppointmentSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_SCHEDULED_SQL)
  await pool.query(CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL)
}
