import { parseAppointmentListQuery } from "../lib/appointments.js"
import {
  fetchAppointmentsForRecipient,
  ensureAppointmentSchema,
} from "./dao/appointmentDao.js"

/**
 * List appointments for a care recipient.
 *
 * The route handler MUST call `requireCareRecipientAccess` first; this
 * service is RBAC-agnostic so the future Epic Encounter sync (Phase 6+)
 * can reuse it for self-checks after writing a row.
 */
export async function listAppointmentsForRecipient(pool, recipientId, query) {
  const filters = parseAppointmentListQuery(query)
  const rows = await fetchAppointmentsForRecipient(pool, recipientId, filters)
  return { appointments: rows }
}

/**
 * Run the idempotent schema migration for `appointments`.
 * Must run after `careRecipientService.ensureSchema` because of the FK.
 */
export async function ensureSchema(pool) {
  return ensureAppointmentSchema(pool)
}
