/**
 * DAO for the `action_plans` and `action_plan_items` tables.
 *
 * The two tables live in one DAO because the dashboard always reads the
 * plan **with** its items; a plan with no items is meaningless to a
 * caregiver. The fetch below returns plans first, then items keyed by
 * `action_plan_id`, and the service layer stitches them — keeps this
 * module SQL-only.
 */

const CREATE_PLANS_TABLE_SQL = `
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
`

const CREATE_ITEMS_TABLE_SQL = `
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
`

const CREATE_INDEX_RECIPIENT_STATUS_SQL = `
  CREATE INDEX IF NOT EXISTS action_plans_recipient_status_idx
    ON action_plans (care_recipient_id, status);
`

const CREATE_INDEX_ITEMS_PLAN_SORT_SQL = `
  CREATE INDEX IF NOT EXISTS action_plan_items_plan_sort_idx
    ON action_plan_items (action_plan_id, sort_order ASC);
`

const SELECT_PLANS_BASE_PROJECTION = `
  SELECT id, care_recipient_id, title, goal_text, status, due_at,
         metadata, created_at, updated_at
    FROM action_plans
`

const SELECT_PLANS_BY_RECIPIENT_SQL = `
  ${SELECT_PLANS_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY updated_at DESC
   LIMIT $2;
`

const SELECT_PLANS_BY_RECIPIENT_STATUS_SQL = `
  ${SELECT_PLANS_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND status = $2
   ORDER BY updated_at DESC
   LIMIT $3;
`

const SELECT_ITEMS_FOR_PLANS_SQL = `
  SELECT id, action_plan_id, label, status, sort_order,
         completed_at, metadata, created_at, updated_at
    FROM action_plan_items
   WHERE action_plan_id = ANY($1::uuid[])
   ORDER BY action_plan_id, sort_order ASC;
`

/**
 * List action plans for a single care recipient.
 *
 * Returns the plain plan rows; the service layer attaches items.
 */
export async function fetchActionPlansForRecipient(
  pool,
  recipientId,
  { status = null, limit },
) {
  if (status) {
    const { rows } = await pool.query(SELECT_PLANS_BY_RECIPIENT_STATUS_SQL, [
      recipientId,
      status,
      limit,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_PLANS_BY_RECIPIENT_SQL, [
    recipientId,
    limit,
  ])
  return rows
}

/**
 * Fetch every item for the given plan ids in one round-trip.
 *
 * Empty `planIds` short-circuits — the SQL is not run with `ANY('{}')`.
 */
export async function fetchItemsForPlans(pool, planIds) {
  if (!Array.isArray(planIds) || planIds.length === 0) return []
  const { rows } = await pool.query(SELECT_ITEMS_FOR_PLANS_SQL, [planIds])
  return rows
}

/**
 * Idempotent migration for `action_plans` and `action_plan_items`.
 * Must run after `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureActionPlanSchema(pool) {
  await pool.query(CREATE_PLANS_TABLE_SQL)
  await pool.query(CREATE_ITEMS_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_STATUS_SQL)
  await pool.query(CREATE_INDEX_ITEMS_PLAN_SORT_SQL)
}
