/**
 * DAO for the `users` table.
 *
 * All PostgreSQL access goes through the injected `pg.Pool` so the route
 * handler never touches the DB driver directly. The pool is injected by the
 * caller which keeps this module easy to test with an in-memory fake (see
 * `test/auth.integration.test.js`).
 *
 * `cognito_sub` is the external identifier; every internal FK uses `users.id`
 * (uuid) so the rest of the schema never leaks a Cognito detail.
 */

const CREATE_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

const UPSERT_SQL = `
  INSERT INTO users (cognito_sub, email, name)
  VALUES ($1, $2, $3)
  ON CONFLICT (cognito_sub) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, users.email),
    name = COALESCE(EXCLUDED.name, users.name),
    updated_at = NOW()
  RETURNING id, cognito_sub, email, name, created_at, updated_at;
`

const SELECT_BY_COGNITO_SUB_SQL = `
  SELECT id, cognito_sub, email, name, created_at, updated_at
  FROM users
  WHERE cognito_sub = $1
`

/**
 * Upsert a user keyed by `cognito_sub` and return the full row.
 *
 * The update branch only overwrites columns that came in non-null, so we
 * never clobber a previously-stored email with a missing claim. `updated_at`
 * is stamped by the DB so clock skew between app servers can never leak in.
 */
export async function upsertUserByCognitoSub(pool, { cognitoSub, email, name }) {
  if (!cognitoSub) throw new Error("cognitoSub is required")
  if (!email) throw new Error("email is required")
  const { rows } = await pool.query(UPSERT_SQL, [cognitoSub, email, name ?? null])
  return rows[0]
}

/**
 * Look up a user by their Cognito `sub` without creating one.
 * Returns `null` when no row matches so callers can branch on existence
 * without catching on the "no rows" error.
 */
export async function fetchUserByCognitoSub(pool, cognitoSub) {
  const { rows } = await pool.query(SELECT_BY_COGNITO_SUB_SQL, [cognitoSub])
  return rows[0] ?? null
}

/**
 * Ensure `pgcrypto` is available and the `users` table exists.
 *
 * Safe to call on every startup — uses `CREATE EXTENSION IF NOT EXISTS` and
 * `CREATE TABLE IF NOT EXISTS`. `pgcrypto` supplies `gen_random_uuid()` which
 * the whole new schema relies on for UUID primary keys.
 */
export async function ensureUserSchema(pool) {
  await pool.query(CREATE_EXTENSION_SQL)
  await pool.query(CREATE_TABLE_SQL)
}
