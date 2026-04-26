import { canAccessCareRecipient } from "../lib/care-recipient-profile.js"
import { fetchCareRecipientProfile } from "./dao/careRecipientProfileDao.js"
import { getMockCareRecipientProfile } from "./mock/careRecipientProfileMock.js"

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
 * Authorization gate for the profile endpoint.
 *
 * Throws a `CareRecipientProfileAccessError` when the user is not
 * permitted to view the recipient. Returns silently on success so route
 * handlers can chain the fetch without a conditional. The real policy
 * lives in `lib/care-recipient-profile.js#canAccessCareRecipient` so the
 * service stays thin and every rule is testable in isolation.
 */
export async function requireProfileAccess(pool, recipientId, userId) {
  // TODO(rbac): replace this with a real care-team membership query once
  // profile data is backed by the DB. The `pool` is already plumbed so the
  // signature does not change when the mock is removed.
  const allowed = canAccessCareRecipient(userId, recipientId)
  if (!allowed) {
    throw new CareRecipientProfileAccessError()
  }
}

/**
 * Load the full `CareRecipientProfile` for the given id.
 *
 * Tries the real DAO first and falls back to the mock module when no row
 * exists — so local dev and CI stay usable before the satellite tables
 * land. Returns `null` when neither the DAO nor the mock recognizes the
 * id; the route handler translates that into a 404.
 *
 * The function intentionally does not run the access check — the route
 * handler must call `requireProfileAccess` first so a 403 cannot leak
 * the existence of a recipient the caller cannot see.
 *
 * TODO(postgres): remove the mock fallback once the DAO is wired to real
 * tables and a migration has seeded at least one recipient in every
 * environment.
 */
export async function getCareRecipientProfile(pool, recipientId) {
  const row = await fetchCareRecipientProfile(pool, recipientId)
  if (row) return row
  return getMockCareRecipientProfile(recipientId)
}
