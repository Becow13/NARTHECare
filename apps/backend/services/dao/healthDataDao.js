/**
 * DAO for the `health_data` table.
 *
 * All PostgreSQL access goes through a checked-out client so the insert batch
 * runs inside a single transaction — the route handler never touches the pool
 * directly. The pool is injected by the caller which keeps this module easy
 * to test with an in-memory fake.
 */

const INSERT_SQL =
  "INSERT INTO health_data (user_id, type, value, recorded_at) VALUES ($1, $2, $3, $4)"

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS health_data (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
  );
`

/**
 * Insert a batch of health-data rows inside a single transaction.
 *
 * The entire batch commits or rolls back together so partial writes never
 * leave the table in an inconsistent state. A short-circuit for empty input
 * avoids pointlessly acquiring a client from the pool.
 */
export async function insertHealthDataRows(pool, rows) {
  if (rows.length === 0) return

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const row of rows) {
      await client.query(INSERT_SQL, [
        row.user_id,
        row.type,
        row.value,
        row.recorded_at,
      ])
    }
    await client.query("COMMIT")
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {
      /* ignore — the outer error is the one worth surfacing */
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * Ensures the `health_data` table exists.
 * Safe to call on every startup — uses `CREATE TABLE IF NOT EXISTS`.
 */
export async function ensureHealthDataSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
}
