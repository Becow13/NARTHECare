/**
 * DAO for the `care_recipients` and `care_team_members` tables.
 *
 * The two tables are kept in one DAO because every care-recipient write also
 * writes to the care-team join row — the transactional insert below keeps the
 * two in sync so a partial failure cannot leave a recipient without an owner.
 */

const CREATE_CARE_RECIPIENTS_SQL = `
  CREATE TABLE IF NOT EXISTS care_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date_of_birth DATE,
    primary_condition TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

const CREATE_CARE_TEAM_MEMBERS_SQL = `
  CREATE TABLE IF NOT EXISTS care_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    permission_level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (care_recipient_id, user_id)
  );
`

// Dashboard hot path — `fetchCareRecipientsForUser` joins on
// `ctm.user_id = $1` and the existing UNIQUE on
// (care_recipient_id, user_id) cannot serve a leading-column-only
// lookup on user_id. This single-column index keeps `/api/care-recipients`
// (and any future "user → recipients" admin query) off a sequential
// scan as the care team table grows.
const CREATE_INDEX_CARE_TEAM_USER_SQL = `
  CREATE INDEX IF NOT EXISTS care_team_members_user_idx
    ON care_team_members (user_id);
`

const INSERT_RECIPIENT_SQL = `
  INSERT INTO care_recipients (name, date_of_birth, primary_condition)
  VALUES ($1, $2, $3)
  RETURNING id, name, date_of_birth, primary_condition, created_at, updated_at;
`

const INSERT_TEAM_MEMBER_SQL = `
  INSERT INTO care_team_members (care_recipient_id, user_id, role, permission_level)
  VALUES ($1, $2, $3, $4)
  RETURNING id, care_recipient_id, user_id, role, permission_level, created_at;
`

const SELECT_RECIPIENTS_FOR_USER_SQL = `
  SELECT cr.id, cr.name, cr.date_of_birth, cr.primary_condition,
         cr.created_at, cr.updated_at,
         ctm.role, ctm.permission_level
  FROM care_recipients cr
  INNER JOIN care_team_members ctm ON ctm.care_recipient_id = cr.id
  WHERE ctm.user_id = $1
  ORDER BY cr.created_at DESC;
`

const SELECT_RECIPIENT_FOR_USER_SQL = `
  SELECT cr.id, cr.name, cr.date_of_birth, cr.primary_condition,
         cr.created_at, cr.updated_at,
         ctm.role, ctm.permission_level
  FROM care_recipients cr
  INNER JOIN care_team_members ctm ON ctm.care_recipient_id = cr.id
  WHERE cr.id = $1 AND ctm.user_id = $2
  LIMIT 1;
`

const SELECT_TEAM_MEMBERSHIP_SQL = `
  SELECT role, permission_level
  FROM care_team_members
  WHERE care_recipient_id = $1 AND user_id = $2
  LIMIT 1;
`

// Phase 4B — used by the nightly background jobs (baseline recompute,
// alert evaluation, AI summary generation) to enumerate every care
// recipient in one round-trip. Deliberately returns just the id column
// so the job loop never accidentally pulls names or DOBs into a job
// log line. ORDER BY created_at ASC keeps reruns deterministic.
const SELECT_ALL_CARE_RECIPIENT_IDS_SQL = `
  SELECT id
  FROM care_recipients
  ORDER BY created_at ASC;
`

/**
 * Create a care recipient and attach the creating user as their first team
 * member in a single transaction.
 *
 * The two inserts run on the same checked-out client inside BEGIN/COMMIT so a
 * failure on the team-member insert rolls back the orphan care-recipient row.
 * Returns both rows so the caller can include the caregiver attribution in
 * the response without a second round-trip.
 */
export async function insertCareRecipientWithOwner(pool, { recipient, owner }) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const { rows: recipientRows } = await client.query(INSERT_RECIPIENT_SQL, [
      recipient.name,
      recipient.date_of_birth,
      recipient.primary_condition,
    ])
    const created = recipientRows[0]
    const { rows: memberRows } = await client.query(INSERT_TEAM_MEMBER_SQL, [
      created.id,
      owner.user_id,
      owner.role,
      owner.permission_level,
    ])
    await client.query("COMMIT")
    return { careRecipient: created, careTeamMember: memberRows[0] }
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {
      /* ignore — the outer error is the one worth surfacing */
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * List every care recipient the given user is on the care team for.
 *
 * The join intentionally lives in SQL so a non-member can never see a row
 * through this API. `ORDER BY created_at DESC` gives the iOS client a stable
 * newest-first list without a client-side sort.
 */
export async function fetchCareRecipientsForUser(pool, userId) {
  const { rows } = await pool.query(SELECT_RECIPIENTS_FOR_USER_SQL, [userId])
  return rows
}

/**
 * Fetch a single care recipient only if the requesting user is on the team.
 *
 * Returns `null` both when the recipient does not exist and when the user
 * has no membership — callers must treat this as 404 to avoid leaking the
 * existence of recipients the user cannot access.
 */
export async function fetchCareRecipientForUser(pool, recipientId, userId) {
  const { rows } = await pool.query(SELECT_RECIPIENT_FOR_USER_SQL, [
    recipientId,
    userId,
  ])
  return rows[0] ?? null
}

/**
 * Check whether a user has any care-team membership for a recipient.
 *
 * Returns the membership row (role + permission_level) on success or `null`
 * when there is no row. Cheaper than `fetchCareRecipientForUser` when the
 * caller only needs to gate an action and does not need the recipient data.
 */
export async function fetchCareTeamMembership(pool, recipientId, userId) {
  const { rows } = await pool.query(SELECT_TEAM_MEMBERSHIP_SQL, [recipientId, userId])
  return rows[0] ?? null
}

/**
 * Enumerate every `care_recipients.id` in the table.
 *
 * Used by Phase 4B's background jobs (baseline recompute, alert
 * evaluation, AI summary generation) which need to sweep every
 * recipient. The job loops MUST NOT pull additional columns from this
 * function — names and DOBs are PHI and have no place in a job log
 * line. Each downstream service call already gates on the recipient
 * id alone.
 */
export async function fetchAllCareRecipientIds(pool) {
  const { rows } = await pool.query(SELECT_ALL_CARE_RECIPIENT_IDS_SQL)
  return rows.map((r) => r.id)
}

/**
 * Ensure the two care-recipient tables exist.
 * Must be called after `ensureUserSchema` because `care_team_members.user_id`
 * is a foreign key into `users(id)`.
 */
export async function ensureCareRecipientSchema(pool) {
  await pool.query(CREATE_CARE_RECIPIENTS_SQL)
  await pool.query(CREATE_CARE_TEAM_MEMBERS_SQL)
  await pool.query(CREATE_INDEX_CARE_TEAM_USER_SQL)
}
