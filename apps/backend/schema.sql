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

-- ─── Phase 4 — canonical health-domain tables ─────────────────────────────────
-- Every table is care-recipient-scoped: `care_recipient_id` is the
-- partition key and an ON DELETE CASCADE FK so removing a recipient
-- tears down every derived row in one transaction. Phase 4 only ships
-- read endpoints; the write paths land in:
--   - Phase 4A (HealthKit sync → `health_observations`,
--     `care_recipient_data_sources`),
--   - Phase 4B (`metric_baselines`, `ai_summaries`, `alerts`).

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
CREATE INDEX IF NOT EXISTS health_observations_recipient_metric_observed_idx
  ON health_observations (care_recipient_id, metric_type, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS health_observations_source_record_uidx
  ON health_observations (source_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

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
CREATE UNIQUE INDEX IF NOT EXISTS metric_baselines_recipient_metric_window_uidx
  ON metric_baselines (care_recipient_id, metric_type, window_days);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  evidence JSONB,
  recommended_actions JSONB,
  model TEXT,
  prompt_version TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_window_start TIMESTAMPTZ,
  source_window_end TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_summaries_recipient_type_generated_idx
  ON ai_summaries (care_recipient_id, summary_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  observed_at TIMESTAMPTZ NOT NULL,
  source_type TEXT,
  source_record_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_recipient_observed_idx
  ON alerts (care_recipient_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS alerts_status_observed_idx
  ON alerts (status, observed_at DESC);
-- Phase 4B — partial UNIQUE backs the engine's `INSERT … ON CONFLICT
-- DO NOTHING` so re-running the rule engine on the same evidence
-- collapses to one alert row. Manual / caregiver-authored alerts pass
-- `source_record_id = NULL` and slip past the index intentionally.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_source_record_uidx
  ON alerts (source_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

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
CREATE INDEX IF NOT EXISTS appointments_recipient_scheduled_idx
  ON appointments (care_recipient_id, scheduled_for ASC);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_source_record_uidx
  ON appointments (source_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal_text TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  due_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS action_plans_recipient_status_idx
  ON action_plans (care_recipient_id, status);

CREATE TABLE IF NOT EXISTS action_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id UUID NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS action_plan_items_plan_sort_idx
  ON action_plan_items (action_plan_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS care_recipient_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected',
  last_synced_at TIMESTAMPTZ,
  external_id TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS care_recipient_data_sources_recipient_source_uidx
  ON care_recipient_data_sources (care_recipient_id, source_type);
