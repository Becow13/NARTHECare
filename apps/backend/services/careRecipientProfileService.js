import { parseCareRecipientProfileUpdate } from "../lib/care-recipients.js"
import {
  fetchCareRecipientProfile,
  ensureCareRecipientProfileSchema,
} from "./dao/careRecipientProfileDao.js"
import {
  fetchCareTeamMembership,
  updateCareRecipientProfile,
} from "./dao/careRecipientDao.js"

/**
 * Sentinel error raised by `requireProfileAccess` so the route layer can
 * translate it to a 403 without pattern-matching on string messages.
 *
 * Mirrors `CareRecipientAccessError` in `careRecipientService.js` — we
 * keep a separate class here so the profile endpoint does not couple
 * its error shape to the list/create endpoints.
 */
export class CareRecipientProfileAccessError extends Error {
  constructor(message = "No access to this care recipient") {
    super(message)
    this.name = "CareRecipientProfileAccessError"
    this.status = 403
  }
}

/**
 * Authorization gate for the profile endpoints.
 *
 * Throws a `CareRecipientProfileAccessError` when the user is not on
 * the care team for the recipient. Returns the membership row on
 * success so the caller can branch on `permission_level` if it ever
 * needs to.
 */
export async function requireProfileAccess(pool, recipientId, userId) {
  const membership = await fetchCareTeamMembership(pool, recipientId, userId)
  if (!membership) {
    throw new CareRecipientProfileAccessError()
  }
  return membership
}

/**
 * Load the full `CareRecipientProfile` for the given id from the
 * canonical Phase 4 tables.
 *
 * Returns `null` when no recipient row exists; the route handler
 * translates that into a 404. The function intentionally does NOT
 * run the access check — the route handler MUST call
 * `requireProfileAccess` first so a 403 cannot leak the existence
 * of a recipient the caller cannot see.
 */
export async function getCareRecipientProfile(pool, recipientId) {
  return fetchCareRecipientProfile(pool, recipientId)
}

/**
 * Apply a caregiver-initiated update to the recipient's profile.
 *
 * The body is parsed in `lib/care-recipients.js` (rejects identity-
 * defining fields, caps text lengths, normalises empties). Returns
 * the refreshed `CareRecipientProfile` shape so the caller can echo
 * the updated row without a follow-up GET. Returns `null` when the
 * recipient row vanished between middleware and handler — the route
 * layer maps that to a 404.
 *
 * Validation errors propagate as plain `Error`s; the route layer
 * translates into a 400. Audit logging happens at the route layer
 * because IP / User-Agent live on the request object.
 */
export async function updateProfile(pool, recipientId, body) {
  const parsed = parseCareRecipientProfileUpdate(body)
  const updated = await updateCareRecipientProfile(pool, recipientId, parsed)
  if (!updated) return null
  return fetchCareRecipientProfile(pool, recipientId)
}

/**
 * Schema migration hook — the profile composite reads from tables
 * other DAOs already create, so this is a no-op kept around for
 * symmetry with the rest of the service barrel.
 */
export async function ensureSchema(pool) {
  return ensureCareRecipientProfileSchema(pool)
}
