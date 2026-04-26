-- Reference schema (also applied automatically on startup via server.js).
-- Each block mirrors the `CREATE TABLE IF NOT EXISTS` statements in the
-- matching DAO so a clean `psql -f schema.sql` reproduces what the app
-- would build at boot.

CREATE TABLE IF NOT EXISTS health_data (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);

-- pgcrypto supplies gen_random_uuid(); required by every table below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'caregiver',
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent migrations from the original (pre-RBAC) schema. Safe to run
-- repeatedly — fresh databases satisfy each ALTER via the CREATE TABLE
-- above and skip the no-ops. Mirrors `MIGRATE_TABLE_SQL` in
-- `services/dao/userDao.js`.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'caregiver';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- Backfill `display_name` from the legacy `name` column only when it
-- still exists. A bare `UPDATE ... SET display_name = name` would fail
-- to parse on databases that never had `name` (column references are
-- resolved at parse time, before any IF EXISTS guard could fire), so
-- we wrap the EXECUTE in a DO block and gate it on information_schema.
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

CREATE TABLE IF NOT EXISTS care_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date_of_birth DATE,
  primary_condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  permission_level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (care_recipient_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
