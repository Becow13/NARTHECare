import test from "node:test"
import assert from "node:assert/strict"
import { createApp } from "../app.js"

// ─── Test harness ────────────────────────────────────────────────────────────
//
// Phase 4A wires two new authenticated routes:
//   - POST /healthkit/sync        (iOS submits a batch of observations)
//   - GET  /healthkit/status?…    (iOS + web reads the registry row)
//
// The fake pool below understands only the SQL these routes plus the
// existing auth / care-team / audit-log routes emit. Any unhandled
// statement throws so an accidental new query in production code surfaces
// loudly here. The state is kept tiny on purpose — every test arranges
// its own fixtures so the read order stays obvious.

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

function createFakePool() {
  const state = {
    users: [],
    careRecipients: [],
    careTeamMembers: [],
    healthObservations: [],
    dataSources: [],
    auditLogs: [],
    idCounter: 0,
  }
  const nextId = () => {
    state.idCounter += 1
    return `00000000-0000-4000-8000-${String(state.idCounter).padStart(12, "0")}`
  }

  // The DAO uses a checked-out client for the batch INSERT transaction.
  // We share a single in-memory state across `pool.query` and
  // `client.query` so the route handler's transaction is observable in
  // the test body.
  async function execute(sql, params = []) {
    const s = sql.trim()

    if (s.startsWith("CREATE ") || s.startsWith("ALTER ")) return { rows: [] }
    if (s.startsWith("DO ")) return { rows: [] }
    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
      return { rows: [] }
    }

    // ── users ───────────────────────────────────────────────────────────
    if (s.startsWith("INSERT INTO users")) {
      const [cognitoSub, email, emailVerified, displayName] = params
      const existing = state.users.find((u) => u.cognito_sub === cognitoSub)
      if (existing) {
        if (email) existing.email = email
        existing.email_verified = Boolean(emailVerified)
        if (displayName) existing.display_name = displayName
        return { rows: [existing] }
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
      s.includes("SELECT id, cognito_sub") &&
      s.includes("FROM users") &&
      s.includes("email IS NOT DISTINCT FROM $1")
    ) {
      const [em] = params
      const matches = state.users.filter((u) =>
        em == null ? u.email == null : u.email === em,
      )
      return {
        rows: matches.slice(0, 2).map((u) => ({
          id: u.id,
          cognito_sub: u.cognito_sub,
        })),
      }
    }

    // ── care_team membership lookup ────────────────────────────────────
    if (s.startsWith("SELECT role, permission_level")) {
      const [recipientId, userId] = params
      const m = state.careTeamMembers.find(
        (x) => x.care_recipient_id === recipientId && x.user_id === userId,
      )
      return {
        rows: m
          ? [{ role: m.role, permission_level: m.permission_level }]
          : [],
      }
    }

    // ── audit_logs ─────────────────────────────────────────────────────
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

    // ── health_observations: INSERT … ON CONFLICT DO NOTHING ───────────
    if (s.startsWith("INSERT INTO health_observations")) {
      const [
        recipientId,
        metricType,
        valueNumeric,
        valueUnit,
        observedAt,
        sourceType,
        sourceId,
        sourceRecordId,
        metadata,
      ] = params
      // Partial UNIQUE (source_type, source_record_id) WHERE source_record_id IS NOT NULL.
      const conflict =
        sourceRecordId &&
        state.healthObservations.some(
          (r) =>
            r.source_type === sourceType && r.source_record_id === sourceRecordId,
        )
      if (conflict) return { rows: [] }
      const row = {
        id: nextId(),
        care_recipient_id: recipientId,
        metric_type: metricType,
        value_numeric: valueNumeric,
        value_unit: valueUnit,
        observed_at: observedAt,
        source_type: sourceType,
        source_id: sourceId,
        source_record_id: sourceRecordId,
        metadata,
        created_at: new Date(),
      }
      state.healthObservations.push(row)
      return { rows: [{ id: row.id }] }
    }

    // ── care_recipient_data_sources: read by (recipient, type) ─────────
    if (
      s.includes("FROM care_recipient_data_sources") &&
      s.includes("source_type = $2") &&
      !s.includes("status = $3")
    ) {
      const [recipientId, sourceType] = params
      const row = state.dataSources.find(
        (r) =>
          r.care_recipient_id === recipientId && r.source_type === sourceType,
      )
      return { rows: row ? [row] : [] }
    }

    // ── care_recipient_data_sources: UPSERT ────────────────────────────
    if (s.startsWith("INSERT INTO care_recipient_data_sources")) {
      const [recipientId, sourceType, status, lastSyncedAt, errorMessage] = params
      let row = state.dataSources.find(
        (r) =>
          r.care_recipient_id === recipientId && r.source_type === sourceType,
      )
      if (row) {
        row.status = status
        // Mirror the COALESCE clause: keep prior `last_synced_at` when
        // the upsert passes null (failed sync).
        if (lastSyncedAt) row.last_synced_at = lastSyncedAt
        row.error_message = errorMessage
        row.updated_at = new Date()
      } else {
        row = {
          id: nextId(),
          care_recipient_id: recipientId,
          source_type: sourceType,
          status,
          last_synced_at: lastSyncedAt,
          external_id: null,
          error_message: errorMessage,
          metadata: null,
          created_at: new Date(),
          updated_at: new Date(),
        }
        state.dataSources.push(row)
      }
      return { rows: [row] }
    }

    throw new Error(`Fake pool: unhandled SQL: ${s.slice(0, 120)}`)
  }

  const pool = {
    async query(sql, params) {
      return execute(sql, params)
    },
    async connect() {
      return {
        query: execute,
        release() {},
      }
    },
  }
  return { pool, state, nextId }
}

function makeVerifier(claimsByToken) {
  return {
    async verify(token) {
      const claims = claimsByToken[token]
      if (!claims) throw new Error("invalid token")
      return claims
    },
  }
}

const ALICE_TOKEN = "alice.jwt"
const BOB_TOKEN = "bob.jwt"
const ALICE_CLAIMS = {
  sub: "cog-alice",
  email: "alice@example.com",
  email_verified: true,
  name: "Alice",
}
const BOB_CLAIMS = {
  sub: "cog-bob",
  email: "bob@example.com",
  email_verified: true,
  name: "Bob",
}

async function buildAppWithRecipients() {
  const { pool, state, nextId } = createFakePool()
  const cognitoVerifier = makeVerifier({
    [ALICE_TOKEN]: ALICE_CLAIMS,
    [BOB_TOKEN]: BOB_CLAIMS,
  })

  const aliceId = nextId()
  const bobId = nextId()
  state.users.push(
    {
      id: aliceId,
      cognito_sub: ALICE_CLAIMS.sub,
      email: ALICE_CLAIMS.email,
      email_verified: true,
      display_name: ALICE_CLAIMS.name,
      role: "caregiver",
      status: "active",
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: bobId,
      cognito_sub: BOB_CLAIMS.sub,
      email: BOB_CLAIMS.email,
      email_verified: true,
      display_name: BOB_CLAIMS.name,
      role: "caregiver",
      status: "active",
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  const aliceRecipientId = nextId()
  const bobRecipientId = nextId()
  state.careRecipients.push(
    {
      id: aliceRecipientId,
      name: "Alice's Mom",
      date_of_birth: null,
      primary_condition: null,
    },
    {
      id: bobRecipientId,
      name: "Bob's Dad",
      date_of_birth: null,
      primary_condition: null,
    },
  )
  state.careTeamMembers.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      user_id: aliceId,
      role: "primary_caregiver",
      permission_level: "full_access",
    },
    {
      id: nextId(),
      care_recipient_id: bobRecipientId,
      user_id: bobId,
      role: "primary_caregiver",
      permission_level: "full_access",
    },
  )

  const app = createApp({ pool, cognitoVerifier })
  return {
    app,
    pool,
    state,
    nextId,
    aliceId,
    bobId,
    aliceRecipientId,
    bobRecipientId,
  }
}

function authHeader(token) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" }
}

function sample(overrides = {}) {
  return {
    sourceType: "healthkit",
    sourceRecordId: "rec-1",
    metricType: "steps",
    value: 1234,
    unit: "count",
    measuredAt: "2026-04-25T00:00:00.000Z",
    ...overrides,
  }
}

// ─── POST /healthkit/sync ──────────────────────────────────────────────────

test("POST /healthkit/sync: 401 without Authorization header", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        careRecipientId: aliceRecipientId,
        observations: [sample()],
      }),
    })
    assert.equal(res.status, 401)
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: 400 when careRecipientId is missing or non-UUID", async () => {
  const { app } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const a = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({ observations: [sample()] }),
    })
    assert.equal(a.status, 400)

    const b = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: "not-a-uuid",
        observations: [sample()],
      }),
    })
    assert.equal(b.status, 400)
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: 403 when caller is not on the care team", async () => {
  const { app, bobRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: bobRecipientId,
        observations: [sample()],
      }),
    })
    assert.equal(res.status, 403)
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: 400 on contract-broken payload (unknown metricType)", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: aliceRecipientId,
        observations: [sample({ metricType: "blood_pressure" })],
      }),
    })
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: 200 inserts rows, returns counts, writes registry + audit", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: aliceRecipientId,
        observations: [
          sample({ sourceRecordId: "rec-a", metricType: "steps", unit: "count", value: 1000 }),
          sample({
            sourceRecordId: "rec-b",
            metricType: "hrv",
            unit: "ms",
            value: 42,
          }),
        ],
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.accepted, 2)
    assert.equal(body.deduped, 0)
    assert.equal(body.rejected, 0)
    assert.ok(typeof body.lastSyncedAt === "string")

    assert.equal(state.healthObservations.length, 2)
    const registry = state.dataSources.find(
      (r) =>
        r.care_recipient_id === aliceRecipientId && r.source_type === "healthkit",
    )
    assert.ok(registry, "registry row was upserted")
    assert.equal(registry.status, "connected")
    assert.equal(registry.error_message, null)

    const audit = state.auditLogs.find(
      (a) => a.action === "SYNC_HEALTHKIT_OBSERVATIONS",
    )
    assert.ok(audit, "SYNC_HEALTHKIT_OBSERVATIONS audit row written")
    assert.equal(audit.resource_id, aliceRecipientId)
    assert.deepEqual(audit.metadata, {
      accepted: 2,
      deduped: 0,
      rejected: 0,
      // Set sorted by lib helper.
      metricTypes: ["hrv", "steps"],
    })
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: 200 second sync silently dedupes the same source_record_id", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const body = JSON.stringify({
      careRecipientId: aliceRecipientId,
      observations: [
        sample({ sourceRecordId: "rec-1" }),
        sample({ sourceRecordId: "rec-2", value: 2000 }),
      ],
    })
    const first = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body,
    })
    assert.equal(first.status, 200)
    const firstBody = await first.json()
    assert.equal(firstBody.accepted, 2)
    assert.equal(firstBody.deduped, 0)

    const second = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body,
    })
    assert.equal(second.status, 200)
    const secondBody = await second.json()
    assert.equal(secondBody.accepted, 0)
    assert.equal(secondBody.deduped, 2)

    // Underlying table only ever gained the original two rows.
    assert.equal(state.healthObservations.length, 2)
  } finally {
    await stopServer(server)
  }
})

test("POST /healthkit/sync: rejects an observation whose unit does not match the metric", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: aliceRecipientId,
        observations: [sample({ metricType: "steps", unit: "bpm" })],
      }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.match(body.error, /unit must be "count"/)
  } finally {
    await stopServer(server)
  }
})

// ─── GET /healthkit/status ─────────────────────────────────────────────────

test("GET /healthkit/status: 401 without Authorization header", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/healthkit/status?careRecipientId=${aliceRecipientId}`,
    )
    assert.equal(res.status, 401)
  } finally {
    await stopServer(server)
  }
})

test("GET /healthkit/status: 400 when careRecipientId is missing or non-UUID", async () => {
  const { app } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const a = await fetch(`${baseUrl}/healthkit/status`, {
      headers: authHeader(ALICE_TOKEN),
    })
    assert.equal(a.status, 400)

    const b = await fetch(
      `${baseUrl}/healthkit/status?careRecipientId=not-a-uuid`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(b.status, 400)
  } finally {
    await stopServer(server)
  }
})

test("GET /healthkit/status: 403 when caller is not on the care team", async () => {
  const { app, bobRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/healthkit/status?careRecipientId=${bobRecipientId}`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 403)
  } finally {
    await stopServer(server)
  }
})

test("GET /healthkit/status: 200 returns neutral not_connected before any sync", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/healthkit/status?careRecipientId=${aliceRecipientId}`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, {
      status: "not_connected",
      lastSyncedAt: null,
      errorMessage: null,
    })

    const audit = state.auditLogs.find(
      (a) => a.action === "VIEW_HEALTHKIT_STATUS",
    )
    assert.ok(audit, "VIEW_HEALTHKIT_STATUS audit row written")
    assert.equal(audit.resource_id, aliceRecipientId)
    // No PHI in metadata — the read is a no-op for analytics fan-out.
    assert.equal(audit.metadata, null)
  } finally {
    await stopServer(server)
  }
})

test("GET /healthkit/status: 200 returns the registry row after a successful sync", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const sync = await fetch(`${baseUrl}/healthkit/sync`, {
      method: "POST",
      headers: authHeader(ALICE_TOKEN),
      body: JSON.stringify({
        careRecipientId: aliceRecipientId,
        observations: [sample()],
      }),
    })
    assert.equal(sync.status, 200)

    const res = await fetch(
      `${baseUrl}/healthkit/status?careRecipientId=${aliceRecipientId}`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, "connected")
    assert.ok(typeof body.lastSyncedAt === "string")
    assert.equal(body.errorMessage, null)
  } finally {
    await stopServer(server)
  }
})
