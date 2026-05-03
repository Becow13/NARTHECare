import test from "node:test"
import assert from "node:assert/strict"
import { createApp } from "../app.js"
import { DEV_MOCK_USER } from "../lib/dev-auth.js"
import * as authService from "../services/authService.js"

// ─── Test harness ────────────────────────────────────────────────────────────

/**
 * Start the Express app on an ephemeral port so each test gets an isolated
 * server. Mirrors the harness in `healthkit-sync.integration.test.js`.
 */
async function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

async function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

/**
 * Minimal stateful fake of the pg.Pool surface used by the new schema.
 *
 * Only the SQL patterns the app actually runs are handled — enough to round-
 * trip a real request through middleware, service, and DAO layers. Unknown
 * SQL throws so a typo in production code would fail loudly in tests.
 */
function createFakePool() {
  const state = {
    users: [],
    careRecipients: [],
    careTeamMembers: [],
    auditLogs: [],
    idCounter: 0,
  }
  const nextId = () => {
    state.idCounter += 1
    return `00000000-0000-4000-8000-${String(state.idCounter).padStart(12, "0")}`
  }

  async function query(sql, params = []) {
    const s = sql.trim()

    // Schema migrations (ignored by the fake — tables exist by virtue of
    // state). The DAOs run a mix of CREATE/ALTER/DO statements at boot
    // and we treat all of them as no-ops. The `users` migration block
    // begins with `ALTER TABLE users ADD COLUMN ...` so the ALTER prefix
    // covers it; the `name -> display_name` backfill is wrapped in a
    // `DO $$ ... $$` block on production so it never reaches the fake
    // as a standalone statement.
    if (s.startsWith("CREATE ") || s.startsWith("ALTER ")) return { rows: [] }
    if (s.startsWith("DO ")) return { rows: [] }

    // ── users ────────────────────────────────────────────────────────────
    if (s.startsWith("INSERT INTO users")) {
      const [cognitoSub, email, emailVerified, displayName] = params
      const existing = state.users.find((u) => u.cognito_sub === cognitoSub)
      if (existing) {
        if (email) existing.email = email
        existing.email_verified = Boolean(emailVerified)
        if (displayName) existing.display_name = displayName
        existing.updated_at = new Date()
        return { rows: [existing] }
      }
      if (email != null && typeof email === "string") {
        const emailDup = state.users.find(
          (u) => u.email != null && u.email === email,
        )
        if (emailDup) {
          const err = new Error("duplicate key value violates unique constraint")
          err.code = "23505"
          err.constraint = "users_email_key"
          err.detail = `Key (email)=(${email}) already exists.`
          throw err
        }
      }
      const row = {
        id: nextId(),
        cognito_sub: cognitoSub,
        email: email ?? null,
        email_verified: Boolean(emailVerified),
        display_name: displayName ?? null,
        role: "caregiver",
        status: "active",
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }
      state.users.push(row)
      return { rows: [row] }
    }

    if (
      s.startsWith("UPDATE users") &&
      s.includes("cognito_sub = $1") &&
      s.includes("WHERE id = $4 AND cognito_sub = $5")
    ) {
      const [nextSub, emailVerified, displayName, userId, prevSub] = params
      const row = state.users.find(
        (u) => u.id === userId && u.cognito_sub === prevSub,
      )
      if (!row) return { rows: [] }
      row.cognito_sub = nextSub
      row.email_verified = Boolean(emailVerified)
      if (displayName != null) row.display_name = displayName
      row.updated_at = new Date()
      return { rows: [row] }
    }

    if (
      s.includes("SELECT id, cognito_sub") &&
      s.includes("FROM users") &&
      s.includes("email IS NOT DISTINCT FROM $1")
    ) {
      const [em] = params
      const matches = state.users.filter((u) =>
        em === null || em === undefined
          ? u.email == null
          : u.email === em,
      )
      return {
        rows: matches.slice(0, 2).map((u) => ({
          id: u.id,
          cognito_sub: u.cognito_sub,
        })),
      }
    }

    if (s.startsWith("UPDATE users") && s.includes("last_login_at = NOW()")) {
      const [userId] = params
      const row = state.users.find((u) => u.id === userId)
      if (!row) return { rows: [] }
      row.last_login_at = new Date()
      row.updated_at = new Date()
      return { rows: [row] }
    }

    if (s.startsWith("SELECT") && s.includes("FROM users") && s.includes("cognito_sub = $1")) {
      const [cognitoSub] = params
      const row = state.users.find((u) => u.cognito_sub === cognitoSub)
      return { rows: row ? [row] : [] }
    }

    // ── care_recipients ─────────────────────────────────────────────────
    if (s.startsWith("INSERT INTO care_recipients")) {
      const [name, dob, condition] = params
      const row = {
        id: nextId(),
        name,
        date_of_birth: dob,
        primary_condition: condition,
        created_at: new Date(),
        updated_at: new Date(),
      }
      state.careRecipients.push(row)
      return { rows: [row] }
    }

    if (s.startsWith("INSERT INTO care_team_members")) {
      const [careRecipientId, userId, role, permissionLevel] = params
      const row = {
        id: nextId(),
        care_recipient_id: careRecipientId,
        user_id: userId,
        role,
        permission_level: permissionLevel,
        created_at: new Date(),
      }
      state.careTeamMembers.push(row)
      return { rows: [row] }
    }

    // Two SELECT variants — list vs single by id. Both include the join to
    // care_team_members and filter by user_id.
    if (
      s.startsWith("SELECT cr.id, cr.name, cr.date_of_birth") &&
      s.includes("WHERE ctm.user_id = $1")
    ) {
      const [userId] = params
      const memberRecipientIds = new Set(
        state.careTeamMembers
          .filter((m) => m.user_id === userId)
          .map((m) => m.care_recipient_id),
      )
      const rows = state.careRecipients
        .filter((cr) => memberRecipientIds.has(cr.id))
        .map((cr) => {
          const m = state.careTeamMembers.find(
            (x) => x.care_recipient_id === cr.id && x.user_id === userId,
          )
          return { ...cr, role: m.role, permission_level: m.permission_level }
        })
      return { rows }
    }

    if (
      s.startsWith("SELECT cr.id, cr.name, cr.date_of_birth") &&
      s.includes("WHERE cr.id = $1 AND ctm.user_id = $2")
    ) {
      const [recipientId, userId] = params
      const cr = state.careRecipients.find((x) => x.id === recipientId)
      const m = state.careTeamMembers.find(
        (x) => x.care_recipient_id === recipientId && x.user_id === userId,
      )
      if (!cr || !m) return { rows: [] }
      return {
        rows: [{ ...cr, role: m.role, permission_level: m.permission_level }],
      }
    }

    if (s.startsWith("SELECT role, permission_level")) {
      const [recipientId, userId] = params
      const m = state.careTeamMembers.find(
        (x) => x.care_recipient_id === recipientId && x.user_id === userId,
      )
      return { rows: m ? [{ role: m.role, permission_level: m.permission_level }] : [] }
    }

    // ── audit_logs ──────────────────────────────────────────────────────
    if (s.startsWith("INSERT INTO audit_logs")) {
      const [actor, action, resourceType, resourceId, metadata, ip, ua] = params
      const row = {
        id: nextId(),
        actor_user_id: actor,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
        ip_address: ip,
        user_agent: ua,
        created_at: new Date(),
      }
      state.auditLogs.push(row)
      return { rows: [{ id: row.id }] }
    }

    // ── transaction noise from DAO ──────────────────────────────────────
    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [] }

    throw new Error(`Fake pool: unhandled SQL: ${s.slice(0, 80)}`)
  }

  const pool = {
    async query(sql, params) {
      return query(sql, params)
    },
    async connect() {
      return {
        query,
        release() {},
      }
    },
  }
  return { pool, state }
}

/** Fake Cognito verifier that accepts any token and returns fixed claims. */
function makeVerifier(claimsByToken) {
  return {
    async verify(token) {
      const claims = claimsByToken[token]
      if (!claims) throw new Error("invalid token")
      return claims
    },
  }
}

const VALID_TOKEN = "valid.jwt.token"
const OTHER_TOKEN = "other.jwt.token"

const VALID_CLAIMS = {
  sub: "cog-sub-1",
  email: "alice@example.com",
  email_verified: true,
  name: "Alice Example",
}
const OTHER_CLAIMS = {
  sub: "cog-sub-2",
  email: "bob@example.com",
  email_verified: false,
  name: "Bob Example",
}

const MERGED_SUB_TOKEN = "merged.jwt.token"
const MERGED_SUB_CLAIMS = {
  sub: "cog-sub-merged",
  email: "alice@example.com",
  email_verified: true,
  name: "Alice Merged",
}

const CONFLICT_SUB_TOKEN = "conflict.jwt.token"
const CONFLICT_SUB_CLAIMS = {
  sub: "cog-sub-conflict",
  email: "alice@example.com",
  email_verified: false,
  name: "Alice Other",
}

/**
 * @param {Record<string, Record<string, unknown>>} [extraTokenClaims]
 *   Additional `token -> claims` entries for `makeVerifier`.
 */
function buildApp(extraTokenClaims = {}) {
  const { pool, state } = createFakePool()
  const cognitoVerifier = makeVerifier({
    [VALID_TOKEN]: VALID_CLAIMS,
    [OTHER_TOKEN]: OTHER_CLAIMS,
    ...extraTokenClaims,
  })
  const app = createApp({ pool, cognitoVerifier })
  return { app, pool, state }
}

// ─── Middleware: unauthenticated cases ──────────────────────────────────────

test("GET /api/me returns 401 when no Authorization header is present", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/api/me`)
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.match(body.error, /Authorization/)
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me returns 401 for a non-Bearer scheme", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: "Basic abc" },
    })
    assert.equal(res.status, 401)
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me returns 401 when the token fails verification", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: "Bearer not.a.real.token" },
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.match(body.error, /Invalid or expired token/)
  } finally {
    await stopServer(server)
  }
})

test("GET /me alias preserves backward compatibility", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.email, "alice@example.com")
  } finally {
    await stopServer(server)
  }
})

// ─── GET /api/me ─────────────────────────────────────────────────────────────

test("GET /api/me upserts the user and returns the safe public profile", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.equal(body.user.email, "alice@example.com")
    assert.equal(body.user.email_verified, true)
    assert.equal(body.user.display_name, "Alice Example")
    assert.equal(body.user.role, "caregiver")
    assert.equal(body.user.status, "active")
    assert.ok(body.user.id, "internal id is returned")
    assert.ok(body.user.last_login_at, "last_login_at is stamped on first call")
    assert.ok(body.user.created_at, "created_at is returned")
    // The handler must never echo Cognito claims back to the client.
    assert.equal(body.user.cognito_sub, undefined)

    assert.equal(state.users.length, 1)
    assert.equal(state.users[0].cognito_sub, "cog-sub-1")
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me writes an AUTHENTICATE_USER audit row with no PHI metadata", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    const audit = state.auditLogs.find((a) => a.action === "AUTHENTICATE_USER")
    assert.ok(audit, "AUTHENTICATE_USER audit row was written")
    assert.equal(audit.resource_type, "user")
    assert.equal(audit.resource_id, state.users[0].id)
    assert.equal(audit.metadata, null, "no PHI metadata leaks to audit row")
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me is idempotent — second call does not duplicate the user row", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(state.users.length, 1)
    // Both calls should each write an audit row.
    const audits = state.auditLogs.filter((a) => a.action === "AUTHENTICATE_USER")
    assert.equal(audits.length, 2)
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me merges a new verified Cognito sub onto the existing email row", async () => {
  const { app, state } = buildApp({
    [MERGED_SUB_TOKEN]: MERGED_SUB_CLAIMS,
  })
  const { server, baseUrl } = await startServer(app)
  try {
    await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${MERGED_SUB_TOKEN}` },
    })
    assert.equal(res.status, 200)
    assert.equal(state.users.length, 1)
    assert.equal(state.users[0].cognito_sub, "cog-sub-merged")
    assert.equal(state.users[0].email, "alice@example.com")

    const mergeAudits = state.auditLogs.filter(
      (a) => a.action === "AUTH_MERGE_COGNITO_IDENTITY",
    )
    assert.equal(mergeAudits.length, 1)
    assert.equal(mergeAudits[0].resource_id, state.users[0].id)
  } finally {
    await stopServer(server)
  }
})

test("GET /api/me returns 409 when the email is taken by another sub and email is not verified", async () => {
  const { app, state } = buildApp({
    [CONFLICT_SUB_TOKEN]: CONFLICT_SUB_CLAIMS,
  })
  const { server, baseUrl } = await startServer(app)
  try {
    await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    const res = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${CONFLICT_SUB_TOKEN}` },
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.match(body.error, /already linked/)

    assert.equal(state.users.length, 1)
    assert.equal(state.users[0].cognito_sub, "cog-sub-1")
  } finally {
    await stopServer(server)
  }
})

// ─── POST /care-recipients ──────────────────────────────────────────────────

test("POST /care-recipients creates a recipient and attaches the caller as primary_caregiver", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Grace Hopper",
        date_of_birth: "1906-12-09",
        primary_condition: "Heart failure",
      }),
    })

    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.success, true)
    assert.equal(body.careRecipient.name, "Grace Hopper")
    assert.equal(body.careTeamMember.role, "primary_caregiver")
    assert.equal(body.careTeamMember.permission_level, "full_access")

    assert.equal(state.careRecipients.length, 1)
    assert.equal(state.careTeamMembers.length, 1)
    assert.equal(state.careTeamMembers[0].user_id, state.users[0].id)

    const audit = state.auditLogs.find((a) => a.action === "CREATE_CARE_RECIPIENT")
    assert.ok(audit, "CREATE_CARE_RECIPIENT audit row was written")
    assert.equal(audit.resource_id, body.careRecipient.id)
  } finally {
    await stopServer(server)
  }
})

test("POST /care-recipients returns 400 when name is missing", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({ primary_condition: "x" }),
    })
    assert.equal(res.status, 400)
    assert.equal(state.careRecipients.length, 0)
  } finally {
    await stopServer(server)
  }
})

// ─── GET /care-recipients (list) ────────────────────────────────────────────

test("GET /care-recipients only returns recipients the caller is on the team for", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    // Alice creates one.
    await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({ name: "Alice's Mother" }),
    })
    // Bob creates a different one.
    await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OTHER_TOKEN}`,
      },
      body: JSON.stringify({ name: "Bob's Father" }),
    })

    const res = await fetch(`${baseUrl}/care-recipients`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.careRecipients.length, 1)
    assert.equal(body.careRecipients[0].name, "Alice's Mother")

    const audit = state.auditLogs.find((a) => a.action === "LIST_CARE_RECIPIENTS")
    assert.ok(audit, "LIST_CARE_RECIPIENTS audit row was written")
    assert.equal(audit.metadata.count, 1)
  } finally {
    await stopServer(server)
  }
})

// ─── GET /care-recipients/:id ───────────────────────────────────────────────

test("GET /care-recipients/:id returns the recipient when the user has access", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const createRes = await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({ name: "Alice's Mother" }),
    })
    const created = await createRes.json()

    const res = await fetch(`${baseUrl}/care-recipients/${created.careRecipient.id}`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.careRecipient.id, created.careRecipient.id)

    const audit = state.auditLogs.find((a) => a.action === "VIEW_CARE_RECIPIENT")
    assert.ok(audit, "VIEW_CARE_RECIPIENT audit row was written")
    assert.equal(audit.resource_id, created.careRecipient.id)
  } finally {
    await stopServer(server)
  }
})

test("GET /care-recipients/:id returns 403 when the caller is not on the team", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const createRes = await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({ name: "Alice's Mother" }),
    })
    const created = await createRes.json()

    // Bob tries to read Alice's recipient.
    const res = await fetch(`${baseUrl}/care-recipients/${created.careRecipient.id}`, {
      headers: { authorization: `Bearer ${OTHER_TOKEN}` },
    })
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.match(body.error, /No access/)
  } finally {
    await stopServer(server)
  }
})

test("GET /care-recipients/:id returns 400 for a non-UUID id", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients/not-a-uuid`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

// ─── GET /care-recipients/:id/profile ───────────────────────────────────────

test("GET /care-recipients/:id/profile returns the mock profile for the known mock id", async () => {
  const { app, state } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const mockId = "11111111-1111-4111-a111-111111111111"
    const res = await fetch(`${baseUrl}/care-recipients/${mockId}/profile`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.careRecipient.id, mockId)
    assert.equal(body.careRecipient.name, "Margaret Chen")
    assert.equal(body.careRecipient.riskLevel, "moderate")
    assert.ok(Array.isArray(body.careRecipient.dataSources))
    assert.ok(body.careRecipient.baseline.steps.min === 3500)

    const audit = state.auditLogs.find(
      (a) => a.action === "VIEW_CARE_RECIPIENT_PROFILE",
    )
    assert.ok(audit, "VIEW_CARE_RECIPIENT_PROFILE audit row was written")
    assert.equal(audit.resource_id, mockId)
    assert.equal(audit.metadata, null, "no PHI metadata leaks to the audit row")
  } finally {
    await stopServer(server)
  }
})

test("GET /care-recipients/:id/profile returns 404 for an unknown UUID", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const otherUuid = "99999999-9999-4999-a999-999999999999"
    const res = await fetch(`${baseUrl}/care-recipients/${otherUuid}/profile`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 404)
  } finally {
    await stopServer(server)
  }
})

test("GET /care-recipients/:id/profile returns 400 for a non-UUID id", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients/not-a-uuid/profile`, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

test("GET /care-recipients/:id/profile returns 401 without an Authorization header", async () => {
  const { app } = buildApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const mockId = "11111111-1111-4111-a111-111111111111"
    const res = await fetch(`${baseUrl}/care-recipients/${mockId}/profile`)
    assert.equal(res.status, 401)
  } finally {
    await stopServer(server)
  }
})

// ─── DEV_AUTH_BYPASS ────────────────────────────────────────────────────────

/**
 * Build an app wired with the dev-bypass identity, using the same fake
 * pool as the Cognito-path tests so we exercise the real DAO upsert.
 *
 * The server bootstrap normally seeds the dev user via
 * `authService.ensureDevUser`; we do the same here so the test mirrors
 * the production boot order.
 */
async function buildBypassApp() {
  const { pool, state } = createFakePool()
  const user = await authService.ensureDevUser(pool)
  const devAuthBypass = { user, role: DEV_MOCK_USER.role }
  const app = createApp({ pool, cognitoVerifier: null, devAuthBypass })
  return { app, pool, state, devUser: user }
}

test("DEV_AUTH_BYPASS: GET /api/me succeeds without Authorization header", async () => {
  const { app, devUser } = await buildBypassApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/api/me`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.email, "dev@narthecare.local")
    assert.equal(body.user.display_name, "Dev User")
    assert.equal(body.user.role, "caregiver")
    assert.equal(body.user.status, "active")
    assert.equal(body.user.id, devUser.id)
  } finally {
    await stopServer(server)
  }
})

test("DEV_AUTH_BYPASS: care-recipient creation attaches the dev user row", async () => {
  const { app, state, devUser } = await buildBypassApp()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Dev Recipient" }),
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.careTeamMember.user_id, devUser.id)
    assert.equal(state.users.length, 1)
    assert.equal(state.users[0].cognito_sub, "dev-bypass")
  } finally {
    await stopServer(server)
  }
})

test("DEV_AUTH_BYPASS: ensureDevUser is idempotent across reboots", async () => {
  const { pool, state } = createFakePool()
  const first = await authService.ensureDevUser(pool)
  const second = await authService.ensureDevUser(pool)
  assert.equal(first.id, second.id)
  assert.equal(state.users.length, 1)
})
