-- NARTHECare schema diagnostics — read-only.
--
-- Run with:
--   psql "$DATABASE_URL" -f apps/backend/scripts/schema-diagnostics.sql
--
-- Returns sanitized counts and schema metadata only. Does not select
-- names, DOBs, metric values, summary text, audit metadata, OAuth
-- tokens, or any other PHI / secret material. Safe to attach to a
-- ticket or share with reviewers.
--
-- Use this file before adding any new foreign-key constraint: every
-- "orphan" row returned here would block the constraint creation, so
-- a non-zero count must be triaged first (delete, repoint, or
-- back-stop the FK with ON DELETE SET NULL like `audit_logs.actor_user_id`).

-- ─── 1. Tables present ───────────────────────────────────────────────────────
SELECT 'tables_present' AS section,
       table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
 ORDER BY table_name;

-- ─── 2. Foreign keys actually enforced (with ON DELETE rule) ─────────────────
SELECT 'foreign_keys' AS section,
       tc.table_name      AS from_table,
       kcu.column_name    AS from_column,
       ccu.table_name     AS to_table,
       ccu.column_name    AS to_column,
       rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema    = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema    = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
 WHERE tc.constraint_type = 'FOREIGN KEY'
   AND tc.table_schema    = 'public'
 ORDER BY tc.table_name, kcu.ordinal_position;

-- ─── 3. Indexes present ──────────────────────────────────────────────────────
SELECT 'indexes' AS section,
       tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;

-- ─── 4. Sanitized row counts ─────────────────────────────────────────────────
SELECT 'row_counts' AS section, 'users' AS tbl, COUNT(*) AS rows FROM users
UNION ALL SELECT 'row_counts', 'care_recipients',             COUNT(*) FROM care_recipients
UNION ALL SELECT 'row_counts', 'care_team_members',           COUNT(*) FROM care_team_members
UNION ALL SELECT 'row_counts', 'audit_logs',                  COUNT(*) FROM audit_logs
UNION ALL SELECT 'row_counts', 'health_observations',         COUNT(*) FROM health_observations
UNION ALL SELECT 'row_counts', 'metric_baselines',            COUNT(*) FROM metric_baselines
UNION ALL SELECT 'row_counts', 'ai_summaries',                COUNT(*) FROM ai_summaries
UNION ALL SELECT 'row_counts', 'alerts',                      COUNT(*) FROM alerts
UNION ALL SELECT 'row_counts', 'appointments',                COUNT(*) FROM appointments
UNION ALL SELECT 'row_counts', 'action_plans',                COUNT(*) FROM action_plans
UNION ALL SELECT 'row_counts', 'action_plan_items',           COUNT(*) FROM action_plan_items
UNION ALL SELECT 'row_counts', 'care_recipient_data_sources', COUNT(*) FROM care_recipient_data_sources
ORDER BY tbl;

-- ─── 5. Orphan diagnostics ───────────────────────────────────────────────────
-- Each row counts how many rows in the child table reference a parent id
-- that does not exist. A non-zero count means a future FK on that pair
-- would fail with `violates foreign key constraint`. Triage by either
-- deleting the orphan, repointing it, or making the column nullable
-- with `ON DELETE SET NULL`.
SELECT 'orphans' AS section, 'care_team_members.user_id'           AS pair, COUNT(*) AS n
  FROM care_team_members ctm LEFT JOIN users u ON u.id = ctm.user_id WHERE u.id IS NULL
UNION ALL SELECT 'orphans', 'care_team_members.care_recipient_id',  COUNT(*)
  FROM care_team_members ctm LEFT JOIN care_recipients cr ON cr.id = ctm.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'audit_logs.actor_user_id',             COUNT(*)
  FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id WHERE al.actor_user_id IS NOT NULL AND u.id IS NULL
UNION ALL SELECT 'orphans', 'health_observations.care_recipient_id', COUNT(*)
  FROM health_observations h LEFT JOIN care_recipients cr ON cr.id = h.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'metric_baselines.care_recipient_id',   COUNT(*)
  FROM metric_baselines m LEFT JOIN care_recipients cr ON cr.id = m.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'ai_summaries.care_recipient_id',       COUNT(*)
  FROM ai_summaries s LEFT JOIN care_recipients cr ON cr.id = s.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'alerts.care_recipient_id',             COUNT(*)
  FROM alerts a LEFT JOIN care_recipients cr ON cr.id = a.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'appointments.care_recipient_id',       COUNT(*)
  FROM appointments a LEFT JOIN care_recipients cr ON cr.id = a.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'action_plans.care_recipient_id',       COUNT(*)
  FROM action_plans p LEFT JOIN care_recipients cr ON cr.id = p.care_recipient_id WHERE cr.id IS NULL
UNION ALL SELECT 'orphans', 'action_plan_items.action_plan_id',     COUNT(*)
  FROM action_plan_items i LEFT JOIN action_plans p ON p.id = i.action_plan_id WHERE p.id IS NULL
UNION ALL SELECT 'orphans', 'care_recipient_data_sources.care_recipient_id', COUNT(*)
  FROM care_recipient_data_sources d LEFT JOIN care_recipients cr ON cr.id = d.care_recipient_id WHERE cr.id IS NULL
ORDER BY pair;
