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
 *
 * `last_login_at` is intentionally NOT touched by the upsert — every
 * authenticated request would otherwise overwrite it, drowning out the
 * actual sign-in event. The `/api/me` route stamps it via
 * `updateLastLoginAt` immediately after middleware-level upsert so the
 * column reflects "last completed Cognito sign-in", which is the field
 * caregivers / auditors care about.
 */

const CREATE_EXTENSION_SQL = "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone TEXT,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'caregiver',
    status TEXT NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

/**
 * Idempotent ALTERs that bring an older `users` table forward.
 *
 * The original schema had a `name TEXT` column and `email TEXT NOT NULL`;
 * the new one renames `name` to `display_name`, relaxes `email` to nullable
 * (Cognito access tokens do not carry email), and adds RBAC + sign-in
 * tracking columns. Each statement is safe to run on every boot — fresh
 * databases satisfy them via `CREATE TABLE` above and skip the no-ops.
 *
 * `phone` / `phone_verified` were added out-of-band to support Cognito
 * phone sign-in and have to stay reconciled here so a `psql -f schema.sql`
 * reproduces the live shape exactly. The boot-time helper relies on
 * `ADD COLUMN IF NOT EXISTS` to make this no-op on databases that already
 * have them.
 *
 * The `name` -> `display_name` backfill is wrapped in a DO block that
 * checks `information_schema.columns` first because plain `UPDATE ... SET
 * display_name = name` fails to parse when `name` was never present (the
 * column reference is resolved at parse time, before any IF EXISTS guards
 * could short-circuit it). Running the EXECUTE inside a conditional means
 * the UPDATE is only ever planned when the legacy column still exists.
 */
const MIGRATE_TABLE_SQL = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'caregiver';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'name'
    ) THEN
      EXECUTE 'UPDATE users SET display_name = name '
           || 'WHERE display_name IS NULL AND name IS NOT NULL';
    END IF;
  END
  $$;
  ALTER TABLE users DROP COLUMN IF EXISTS name;
`

const RETURNING_COLUMNS = `
  id, cognito_sub, email, email_verified, phone, phone_verified, display_name,
  role, status, last_login_at, created_at, updated_at
`

const UPSERT_SQL = `
  INSERT INTO users (cognito_sub, email, email_verified, display_name)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (cognito_sub) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, users.email),
    email_verified = EXCLUDED.email_verified,
    display_name = COALESCE(EXCLUDED.display_name, users.display_name),
    updated_at = NOW()
  RETURNING ${RETURNING_COLUMNS};
`

const SELECT_ID_AND_SUB_BY_EMAIL_SQL = `
  SELECT id, cognito_sub
  FROM users
  WHERE email IS NOT DISTINCT FROM $1
  LIMIT 2;
`

const REPOINT_COGNITO_SUB_SQL = `
  UPDATE users
  SET
    cognito_sub = $1,
    email_verified = $2,
    display_name = COALESCE($3, users.display_name),
    updated_at = NOW()
  WHERE id = $4 AND cognito_sub = $5
  RETURNING ${RETURNING_COLUMNS};
`

const SELECT_BY_COGNITO_SUB_SQL = `
  SELECT ${RETURNING_COLUMNS}
  FROM users
  WHERE cognito_sub = $1
`

const UPDATE_LAST_LOGIN_SQL = `
  UPDATE users
  SET last_login_at = NOW(), updated_at = NOW()
  WHERE id = $1
  RETURNING ${RETURNING_COLUMNS};
`

// Caregiver-editable profile fields only. Cognito-bound columns
// (`cognito_sub`, `email`, `email_verified`) and security-sensitive
// columns (`role`, `status`) are deliberately NOT updatable from a
// normal profile UI — those flow through Cognito (email) or admin
// tooling (role/status) so a hijacked session cannot escalate.
// The COALESCE-pair keeps fields the caller did not send (NULL
// param) at their previous value.
const UPDATE_USER_PROFILE_SQL = `
  UPDATE users
  SET
    display_name = COALESCE($2, display_name),
    phone = COALESCE($3, phone),
    updated_at = NOW()
  WHERE id = $1
  RETURNING ${RETURNING_COLUMNS};
`

/**
 * Upsert a user keyed by `cognito_sub` and return the full row.
 *
 * The update branch only overwrites `email` / `display_name` when the
 * incoming claim is non-null, so we never clobber a previously-stored
 * value with a missing claim (access tokens don't carry email or name).
 * `email_verified` IS overwritten on every call — its value is fully
 * determined by the verified Cognito claim and downgrades to `false`
 * are meaningful (e.g. caregiver changed their email in the pool and
 * has not re-verified yet). `updated_at` is stamped by the DB so clock
 * skew between app servers can never leak in.
 *
 * `email` is optional at the DAO level: the `users` table now allows
 * NULL email, and the route handler is the right place to enforce
 * stricter requirements (e.g. ID-token-only flows).
 */
export async function upsertUserByCognitoSub(
  pool,
  { cognitoSub, email, emailVerified, displayName },
) {
  if (!cognitoSub) throw new Error("cognitoSub is required")
  const { rows } = await pool.query(UPSERT_SQL, [
    cognitoSub,
    email ?? null,
    Boolean(emailVerified),
    displayName ?? null,
  ])
  return rows[0]
}

/**
 * Load internal `users.id` + `cognito_sub` for rows sharing a given email.
 *
 * Returns at most two rows so callers can detect a corrupted database (more
 * than one distinct email match should be impossible while `email` is UNIQUE).
 * Empty array means no row claims that email.
 *
 * @param {import("pg").Pool} pool
 * @param {string} email Non-null email string (callers must not pass NULL).
 * @returns {Promise<Array<{ id: string, cognito_sub: string }>>}
 */
export async function fetchUserIdentityKeysByEmail(pool, email) {
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("email (non-empty string) is required")
  }
  const { rows } = await pool.query(SELECT_ID_AND_SUB_BY_EMAIL_SQL, [email])
  return rows
}

/**
 * Move `cognito_sub` onto an existing user row after a verified-email merge.
 *
 * The `WHERE id AND cognito_sub` guard prevents a concurrent repoint from
 * clobbering the wrong row. Returns `null` when zero rows matched (caller
 * should treat as failure and fall back to the original error path).
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   userId: string,
 *   previousCognitoSub: string,
 *   nextCognitoSub: string,
 *   emailVerified: boolean,
 *   displayName: string | null,
 * }} args
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function repointCognitoSubForVerifiedEmailMerge(pool, args) {
  const {
    userId,
    previousCognitoSub,
    nextCognitoSub,
    emailVerified,
    displayName,
  } = args
  if (!userId) throw new Error("userId is required")
  if (!previousCognitoSub) throw new Error("previousCognitoSub is required")
  if (!nextCognitoSub) throw new Error("nextCognitoSub is required")
  const { rows } = await pool.query(REPOINT_COGNITO_SUB_SQL, [
    nextCognitoSub,
    Boolean(emailVerified),
    displayName ?? null,
    userId,
    previousCognitoSub,
  ])
  return rows[0] ?? null
}

/**
 * Stamp `last_login_at = NOW()` on the given user and return the full row.
 *
 * Called from the `/api/me` route after the middleware-level upsert so
 * `last_login_at` only moves on a completed sign-in. Callers that just
 * want the current row should use `fetchUserByCognitoSub` instead.
 */
export async function updateLastLoginAt(pool, userId) {
  if (!userId) throw new Error("userId is required")
  const { rows } = await pool.query(UPDATE_LAST_LOGIN_SQL, [userId])
  return rows[0] ?? null
}

/**
 * Update a user's caregiver-editable profile fields and return the
 * refreshed row.
 *
 * `displayName` and `phone` accept `null` to mean "leave unchanged"
 * (so a partial PATCH does not clobber the other column). To clear
 * a value, the route handler should normalise an empty submission
 * to an empty string before reaching this function — the DAO does
 * not interpret null as "clear" because the partial-PATCH case is
 * the more common one in practice.
 *
 * Returns `null` when no row matched (the user vanished between
 * middleware and handler), which the caller should map to a 401.
 */
export async function updateUserProfile(
  pool,
  { userId, displayName = null, phone = null },
) {
  if (!userId) throw new Error("userId is required")
  const { rows } = await pool.query(UPDATE_USER_PROFILE_SQL, [
    userId,
    displayName,
    phone,
  ])
  return rows[0] ?? null
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
 * Ensure `pgcrypto` is available, the `users` table exists, and the
 * idempotent column migrations have been applied.
 *
 * Safe to call on every startup — uses `CREATE EXTENSION IF NOT EXISTS`,
 * `CREATE TABLE IF NOT EXISTS`, and `ALTER TABLE ... IF [NOT] EXISTS`.
 * `pgcrypto` supplies `gen_random_uuid()` which the rest of the schema
 * relies on for UUID primary keys.
 */
export async function ensureUserSchema(pool) {
  await pool.query(CREATE_EXTENSION_SQL)
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(MIGRATE_TABLE_SQL)
}
