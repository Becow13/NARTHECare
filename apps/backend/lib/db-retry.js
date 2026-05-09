/**
 * Retry helper for transient PostgreSQL / network failures.
 *
 * Keep this file free of I/O — it wraps async functions; it has no direct
 * dependency on `pg` and is safe to import from services, DAOs, and tests.
 *
 * Retryable conditions:
 *   - Network-level: ECONNRESET, ECONNREFUSED, ETIMEDOUT (the pool lost the
 *     TCP connection between health checks and the query reached a dead socket)
 *   - PostgreSQL serialization failure (40001): a concurrent transaction
 *     modified a row we were about to read/write; the serializable isolation
 *     spec requires the loser to retry
 *   - PostgreSQL deadlock detected (40P01): similar to 40001; Postgres always
 *     rolls back one party and expects it to retry
 *   - PostgreSQL too_many_connections (53300): transient pool exhaustion; a
 *     brief wait often clears it
 *
 * Non-retryable conditions (errors are rethrown immediately):
 *   - Constraint violations, invalid queries, auth failures, and any other
 *     deterministic failure that will not resolve by repeating the call.
 *
 * @module lib/db-retry
 */

/** PostgreSQL SQLSTATE codes that are always safe to retry. */
const RETRYABLE_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
])

/** Node.js / OS error codes that indicate a dropped TCP connection. */
const RETRYABLE_NODE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
])

/**
 * Return true when `err` represents a transient condition that is safe to
 * retry without risk of double-applying a write.
 *
 * NOTE: Callers are responsible for ensuring the wrapped operation is
 * idempotent (or wrapped in a transaction that is rolled back on failure)
 * before passing it to `withDbRetry`.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableDbError(err) {
  if (!err || typeof err !== "object") return false
  const e = /** @type {{ code?: string }} */ (err)
  if (e.code && RETRYABLE_PG_CODES.has(e.code)) return true
  if (e.code && RETRYABLE_NODE_CODES.has(e.code)) return true
  return false
}

/**
 * Execute `fn` with exponential back-off retry for transient DB errors.
 *
 * The first attempt runs immediately.  On a retryable failure the helper
 * waits `baseDelayMs * 2^attempt` milliseconds (plus ±20 % jitter) before
 * the next try.  Once `maxAttempts` is exhausted the last error is rethrown.
 *
 * @template T
 * @param {() => Promise<T>} fn      Async factory for the DB operation.
 *   MUST be idempotent or wrapped in a transaction rolled back on failure.
 * @param {object}  [opts]
 * @param {number}  [opts.maxAttempts=3]   Total attempts before giving up.
 * @param {number}  [opts.baseDelayMs=100] Base back-off delay in ms.
 * @returns {Promise<T>}
 */
export async function withDbRetry(fn, { maxAttempts = 3, baseDelayMs = 100 } = {}) {
  let lastErr
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryableDbError(err) || attempt === maxAttempts - 1) {
        throw err
      }
      const base = baseDelayMs * Math.pow(2, attempt)
      // ±20 % jitter prevents a thundering herd when many connections fail
      // simultaneously (e.g. DB restart or network blip).
      const jitter = base * 0.2 * (Math.random() * 2 - 1)
      const delay = Math.round(base + jitter)
      console.log(
        `[db-retry] transient error (code=${/** @type {any} */ (err).code}), attempt ${attempt + 1}/${maxAttempts}, retrying in ${delay}ms`,
      )
      await _sleep(delay)
    }
  }
  // Should never be reached, but satisfies TypeScript / eslint.
  throw lastErr
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
