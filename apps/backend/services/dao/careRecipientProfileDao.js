/**
 * DAO placeholder for the full care-recipient profile.
 *
 * This module will eventually own the SQL that assembles the
 * `CareRecipientProfile` shape (joining `care_recipients`,
 * `care_team_members`, `health_background`, `data_source_connections`,
 * `care_recipient_baseline`, and `care_recipient_notes`). No tables exist
 * yet, so every function below currently returns `null` and the service
 * layer falls back to the mock module.
 *
 * Keeping this file in place now (instead of lazily adding it later) so the
 * service layer's call-site does not churn when the real DB lands — only
 * this file changes.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

// TODO(postgres): move the full schema into `schema.sql` and a
// `ensureCareRecipientProfileSchema(pool)` helper here. Proposed tables:
//   - health_background (care_recipient_id FK, conditions TEXT[], allergies
//     TEXT[], medications TEXT[], mobility_status TEXT, fall_risk_notes TEXT)
//   - data_source_connections (care_recipient_id FK, type TEXT, status TEXT,
//     last_synced_at TIMESTAMPTZ, error_message TEXT)
//   - care_recipient_baseline (care_recipient_id FK, steps_min/max,
//     sleep_min/max, hr_min/max, blood_pressure, last_updated)
//   - care_recipient_notes (id UUID, care_recipient_id FK, author_user_id FK,
//     content TEXT, created_at TIMESTAMPTZ)
// All tables must reference `care_recipients(id) ON DELETE CASCADE` so a
// removed recipient tears down every derived row in one transaction.

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Fetch the full `CareRecipientProfile` shape for the given recipient id.
 *
 * Returns `null` both when the recipient does not exist and when any of the
 * satellite tables are missing — the service layer treats null as "fall
 * back to the mock so the feature stays usable during bring-up". Once the
 * schema is real, null must mean "no such recipient" and the service
 * fallback must be removed at the same time.
 *
 * TODO(postgres): implement the JOIN that assembles the full shape. Query
 * must select only columns the requesting user is allowed to see — do the
 * access gate in the service layer before calling this function so the
 * SQL stays policy-free.
 */
// eslint-disable-next-line no-unused-vars
export async function fetchCareRecipientProfile(pool, recipientId) {
  return null
}

/**
 * Idempotent schema migration for the profile satellite tables.
 *
 * No-op today. Will be called from the server bootstrap alongside the
 * other `ensureSchema` helpers once the real tables exist.
 *
 * TODO(postgres): add `CREATE TABLE IF NOT EXISTS` statements for the
 * tables listed at the top of this module.
 */
// eslint-disable-next-line no-unused-vars
export async function ensureCareRecipientProfileSchema(pool) {
  return undefined
}
