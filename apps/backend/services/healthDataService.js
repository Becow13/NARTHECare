import { collectHealthRows } from "../lib/health-data.js"
import {
  insertHealthDataRows,
  ensureHealthDataSchema,
} from "./dao/healthDataDao.js"

/**
 * Persist a batch of HealthKit-shaped rows for a user.
 *
 * Combines the pure parsing step with the transactional DB insert so the
 * route handler only has to deal with auth + response shape. Validation
 * errors surface as plain `Error`s (→ 400 at the route layer); unexpected
 * DB failures are rethrown for the caller to translate into a 500.
 */
export async function saveHealthData(pool, userId, payload) {
  const rows = collectHealthRows(userId, payload)
  if (rows.length === 0) return { inserted: 0 }
  await insertHealthDataRows(pool, rows)
  return { inserted: rows.length }
}

/**
 * Run the idempotent schema migration for the `health_data` table.
 * Called once at server boot — re-exported from the service layer so the
 * bootstrap code has a single import surface per feature.
 */
export async function ensureSchema(pool) {
  return ensureHealthDataSchema(pool)
}
