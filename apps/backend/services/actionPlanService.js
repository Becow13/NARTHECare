import { parseActionPlanListQuery } from "../lib/action-plans.js"
import {
  fetchActionPlansForRecipient,
  fetchItemsForPlans,
  ensureActionPlanSchema,
} from "./dao/actionPlanDao.js"

/**
 * List action plans (with their items) for a care recipient.
 *
 * Two round-trips by design — the items query runs only when at least
 * one plan came back, so the no-plans path is single-query and silent.
 * The route handler MUST call `requireCareRecipientAccess` first.
 */
export async function listActionPlansForRecipient(pool, recipientId, query) {
  const filters = parseActionPlanListQuery(query)
  const plans = await fetchActionPlansForRecipient(pool, recipientId, filters)
  if (plans.length === 0) return { actionPlans: [] }

  const itemRows = await fetchItemsForPlans(
    pool,
    plans.map((p) => p.id),
  )
  return { actionPlans: _attachItems(plans, itemRows) }
}

/**
 * Run the idempotent schema migration for `action_plans` and items.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureActionPlanSchema(pool)
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Bucket items by `action_plan_id` and attach them to their parent plan.
 *
 * Pure and side-effect-free so the service stays trivially testable.
 * Plans with no items get an empty `items` array (the dashboard's
 * grouping renderer relies on the array being present, not optional).
 */
function _attachItems(plans, items) {
  const byPlanId = new Map()
  for (const item of items) {
    const list = byPlanId.get(item.action_plan_id)
    if (list) {
      list.push(item)
    } else {
      byPlanId.set(item.action_plan_id, [item])
    }
  }
  return plans.map((plan) => ({
    ...plan,
    items: byPlanId.get(plan.id) ?? [],
  }))
}
