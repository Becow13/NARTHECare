import {
  parseCareRecipientInput,
  CARE_TEAM_ROLES,
  CARE_TEAM_PERMISSION_LEVELS,
} from "../lib/care-recipients.js"
import {
  insertCareRecipientWithOwner,
  fetchCareRecipientsForUser,
  fetchCareRecipientForUser,
  fetchCareTeamMembership,
  ensureCareRecipientSchema,
} from "./dao/careRecipientDao.js"

/**
 * Create a new care recipient owned by the calling user.
 *
 * The creating user is automatically attached as the `primary_caregiver`
 * with `full_access` so the first write establishes the care team in one
 * step. Input validation surfaces as plain `Error`s (→ 400 at the route
 * layer); unexpected DB failures propagate for the 500 handler.
 */
export async function createCareRecipient(pool, userId, body) {
  const recipient = parseCareRecipientInput(body)
  const { careRecipient, careTeamMember } = await insertCareRecipientWithOwner(pool, {
    recipient,
    owner: {
      user_id: userId,
      role: CARE_TEAM_ROLES.primaryCaregiver,
      permission_level: CARE_TEAM_PERMISSION_LEVELS.fullAccess,
    },
  })
  return { careRecipient, careTeamMember }
}

/**
 * List every care recipient the given user is on the care team for.
 *
 * Delegates to the DAO whose SQL join enforces the access rule — we never
 * filter in application code to guarantee the same SQL would be safe to
 * expose to a future read-only replica.
 */
export async function listCareRecipientsForUser(pool, userId) {
  return fetchCareRecipientsForUser(pool, userId)
}

/**
 * Fetch one care recipient only if the user is on their care team.
 *
 * Returns `null` both for nonexistent ids and for ids the user cannot
 * access so the route layer responds with 404 in either case (never 403
 * for existence-revealing reasons).
 */
export async function getCareRecipientForUser(pool, recipientId, userId) {
  return fetchCareRecipientForUser(pool, recipientId, userId)
}

/**
 * Authorization gate for any route that acts on a single care recipient.
 *
 * Resolves to the membership row (`role`, `permission_level`) when the
 * user has access; throws a `CareRecipientAccessError` (status 403) when
 * they do not. Route handlers translate the thrown error into the final
 * response shape so this function stays protocol-agnostic.
 */
export async function requireCareRecipientAccess(pool, recipientId, userId) {
  const membership = await fetchCareTeamMembership(pool, recipientId, userId)
  if (!membership) {
    throw new CareRecipientAccessError()
  }
  return membership
}

/**
 * Sentinel error raised by `requireCareRecipientAccess` so the route layer
 * can translate it to a 403 without pattern-matching on string messages.
 */
export class CareRecipientAccessError extends Error {
  constructor(message = "No access to this care recipient") {
    super(message)
    this.name = "CareRecipientAccessError"
    this.status = 403
  }
}

/**
 * Run the idempotent schema migration for the `care_recipients` and
 * `care_team_members` tables. Must run after `authService.ensureSchema`.
 */
export async function ensureSchema(pool) {
  return ensureCareRecipientSchema(pool)
}
