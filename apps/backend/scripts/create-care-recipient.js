/**
 * Admin one-shot — create a care recipient and attach an existing
 * caregiver as their `primary_caregiver` / `full_access` first
 * team member.
 *
 * The web app does not yet have a "create care recipient" UI and the
 * iOS app is locked to its sync-companion scope (see
 * `.cursor/rules/ios-style.mdc`), so the very first care recipient on
 * a brand-new caregiver account has to be bootstrapped out-of-band.
 * This script is that out-of-band path. Once the web flow ships, this
 * file becomes a backfill / recovery tool only.
 *
 * Usage (run with the dev tunnel open or against an Aptible app
 * environment that already has DATABASE_URL set):
 *
 *   node scripts/create-care-recipient.js \
 *     --email caregiver@example.com \
 *     --name "Margaret Chen" \
 *     --dob 1955-03-22 \
 *     --condition "Type 2 diabetes"
 *
 * The owner is looked up by email — the same `users.email` Cognito
 * upserts on sign-in — so it must be a verified, currently-signed-in
 * caregiver account. Email lookup intentionally rejects ambiguous
 * matches (it should be impossible while `users.email` is UNIQUE,
 * but we surface a clear error rather than picking arbitrarily).
 *
 * **Logging:** never echoes the email, recipient name, DOB, or
 * primary_condition — those values are PHI / identifying. The
 * envelope written to stdout contains only the resulting
 * `careRecipientId` and `careTeamMemberId` so audit / cron logs
 * stay safe.
 */
import { parseArgs } from "node:util"

import { careRecipientService } from "../services/index.js"
import { fetchUserIdentityKeysByEmail } from "../services/dao/userDao.js"
import { runJob } from "./_job-runtime.js"

/**
 * Parse argv into the shape `careRecipientService.createCareRecipient`
 * expects. Throws plain `Error` on bad / missing input — `runJob` will
 * surface the message and exit 1 without leaking any value into the
 * stack trace.
 */
function _parseArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      dob: { type: "string" },
      condition: { type: "string" },
    },
    strict: true,
  })

  const email = (values.email ?? "").trim().toLowerCase()
  const name = (values.name ?? "").trim()
  if (!email) throw new Error("--email <caregiver-email> is required")
  if (!name) throw new Error("--name <recipient-name> is required")

  const body = { name }
  if (values.dob) body.date_of_birth = values.dob
  if (values.condition) body.primary_condition = values.condition

  return { email, body }
}

/**
 * Resolve a caregiver `users.id` from their email.
 *
 * Returns the single matching id or throws a clear, PHI-free error
 * for the runner to log. Two-row results indicate a corrupted
 * `users` table (UNIQUE on `email` should make it impossible) and
 * are surfaced as a hard failure instead of a silent pick.
 */
async function _resolveOwnerId(pool, email) {
  const rows = await fetchUserIdentityKeysByEmail(pool, email)
  if (rows.length === 0) {
    throw new Error(
      "No user found for the supplied --email. The caregiver must sign in to NARTHECare at least once before bootstrapping their first care recipient.",
    )
  }
  if (rows.length > 1) {
    throw new Error(
      "Multiple users matched the supplied --email. Refusing to pick — investigate the `users` table before retrying.",
    )
  }
  return rows[0].id
}

await runJob("create-care-recipient", async (pool) => {
  const { email, body } = _parseArgv(process.argv.slice(2))
  const ownerId = await _resolveOwnerId(pool, email)
  const result = await careRecipientService.createCareRecipient(
    pool,
    ownerId,
    body,
  )
  return {
    careRecipientId: result.careRecipient.id,
    careTeamMemberId: result.careTeamMember.id,
  }
})
