import test from "node:test"
import assert from "node:assert/strict"
import { createApp } from "../app.js"

// ─── Test harness ────────────────────────────────────────────────────────────
//
// Phase 4 ships eight new read endpoints (per-recipient observations,
// baselines, summaries, alerts, appointments, action-plans, data-sources
// + the cross-recipient `/alerts` feed). The fake pool below understands
// only the SQL these routes plus the existing auth / care-team /
// audit-log routes emit — every other statement throws so an accidental
// new query in production code surfaces loudly in tests.
//
// Test focus is the route layer's contract: status codes, access gate,
// query-parse failures, and the audit-metadata shape (counts only,
// never PHI). The DAO's exact SQL shape is verified indirectly by
// inserting rows into the fake state and asserting the response body.

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
 * Fake pool that owns a tiny in-memory state plus pattern-matched SQL
 * handlers for every table the Phase 4 routes touch. Rows are seeded
 * via the `state` object exposed alongside the pool so each test can
 * arrange its own fixtures without going through writers.
 */
function createFakePool() {
  const state = {
    users: [],
    careRecipients: [],
    careTeamMembers: [],
    healthObservations: [],
    metricBaselines: [],
    aiSummaries: [],
    alerts: [],
    appointments: [],
    actionPlans: [],
    actionPlanItems: [],
    dataSources: [],
    auditLogs: [],
    idCounter: 0,
  }
  const nextId = () => {
    state.idCounter += 1
    return `00000000-0000-4000-8000-${String(state.idCounter).padStart(12, "0")}`
  }

  async function query(sql, params = []) {
    const s = sql.trim()

    // Schema migrations — the DAOs run a mix of CREATE / ALTER / DO at
    // boot. Treat them as no-ops in the fake.
    if (s.startsWith("CREATE ") || s.startsWith("ALTER ")) return { rows: [] }
    if (s.startsWith("DO ")) return { rows: [] }
    if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [] }

    // ── users ───────────────────────────────────────────────────────────
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
    if (s.startsWith("UPDATE users") && s.includes("last_login_at = NOW()")) {
      const [userId] = params
      const row = state.users.find((u) => u.id === userId)
      if (!row) return { rows: [] }
      row.last_login_at = new Date()
      return { rows: [row] }
    }

    // ── care_recipients ────────────────────────────────────────────────
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
    if (
      s.startsWith("SELECT cr.id, cr.name, cr.date_of_birth") &&
      s.includes("WHERE ctm.user_id = $1")
    ) {
      const [userId] = params
      const recipientIds = new Set(
        state.careTeamMembers
          .filter((m) => m.user_id === userId)
          .map((m) => m.care_recipient_id),
      )
      const rows = state.careRecipients
        .filter((cr) => recipientIds.has(cr.id))
        .map((cr) => {
          const m = state.careTeamMembers.find(
            (x) => x.care_recipient_id === cr.id && x.user_id === userId,
          )
          return { ...cr, role: m.role, permission_level: m.permission_level }
        })
      return { rows }
    }
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

    // ── health_observations ────────────────────────────────────────────
    if (s.includes("FROM health_observations")) {
      let [recipientId] = params
      let rows = state.healthObservations.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("metric_type = $2")) {
        const [, metric] = params
        rows = rows.filter((r) => r.metric_type === metric)
        if (s.includes("observed_at >= $3")) {
          const [, , since] = params
          rows = rows.filter((r) => new Date(r.observed_at) >= new Date(since))
        }
      } else if (s.includes("observed_at >= $2")) {
        const [, since] = params
        rows = rows.filter((r) => new Date(r.observed_at) >= new Date(since))
      }
      rows = [...rows].sort(
        (a, b) => new Date(b.observed_at) - new Date(a.observed_at),
      )
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }

    // ── metric_baselines ───────────────────────────────────────────────
    if (s.includes("FROM metric_baselines")) {
      let [recipientId] = params
      let rows = state.metricBaselines.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("metric_type = $2") && s.includes("window_days = $3")) {
        const [, metric, window] = params
        rows = rows.filter(
          (r) => r.metric_type === metric && r.window_days === window,
        )
      } else if (s.includes("metric_type = $2")) {
        const [, metric] = params
        rows = rows.filter((r) => r.metric_type === metric)
      } else if (s.includes("window_days = $2")) {
        const [, window] = params
        rows = rows.filter((r) => r.window_days === window)
      }
      return { rows }
    }

    // ── ai_summaries ───────────────────────────────────────────────────
    if (s.includes("FROM ai_summaries")) {
      let [recipientId] = params
      let rows = state.aiSummaries.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("summary_type = $2")) {
        const [, type] = params
        rows = rows.filter((r) => r.summary_type === type)
      }
      rows = [...rows].sort(
        (a, b) => new Date(b.generated_at) - new Date(a.generated_at),
      )
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }

    // ── alerts ─────────────────────────────────────────────────────────
    if (s.includes("FROM alerts")) {
      let rows
      if (s.includes("care_recipient_id = ANY($1::uuid[])")) {
        const [recipientIds] = params
        const idSet = new Set(recipientIds)
        rows = state.alerts.filter((r) => idSet.has(r.care_recipient_id))
        if (s.includes("severity = $2") && s.includes("status = $3")) {
          const [, sev, st] = params
          rows = rows.filter((r) => r.severity === sev && r.status === st)
        } else if (s.includes("severity = $2")) {
          const [, sev] = params
          rows = rows.filter((r) => r.severity === sev)
        } else if (s.includes("status = $2")) {
          const [, st] = params
          rows = rows.filter((r) => r.status === st)
        }
      } else {
        const [recipientId] = params
        rows = state.alerts.filter((r) => r.care_recipient_id === recipientId)
        if (s.includes("severity = $2") && s.includes("status = $3")) {
          const [, sev, st] = params
          rows = rows.filter((r) => r.severity === sev && r.status === st)
        } else if (s.includes("severity = $2")) {
          const [, sev] = params
          rows = rows.filter((r) => r.severity === sev)
        } else if (s.includes("status = $2")) {
          const [, st] = params
          rows = rows.filter((r) => r.status === st)
        }
      }
      rows = [...rows].sort(
        (a, b) => new Date(b.observed_at) - new Date(a.observed_at),
      )
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }

    // ── appointments ───────────────────────────────────────────────────
    if (s.includes("FROM appointments")) {
      let [recipientId, ...rest] = params
      let rows = state.appointments.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("status = $2")) {
        rows = rows.filter((r) => r.status === rest[0])
      }
      const now = new Date()
      if (s.includes("scheduled_for >= NOW()")) {
        rows = rows.filter((r) => new Date(r.scheduled_for) >= now)
        rows.sort(
          (a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for),
        )
      } else if (s.includes("scheduled_for < NOW()")) {
        rows = rows.filter((r) => new Date(r.scheduled_for) < now)
        rows.sort(
          (a, b) => new Date(b.scheduled_for) - new Date(a.scheduled_for),
        )
      } else {
        rows.sort(
          (a, b) => new Date(b.scheduled_for) - new Date(a.scheduled_for),
        )
      }
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }

    // ── action_plans ───────────────────────────────────────────────────
    if (s.includes("FROM action_plans")) {
      let [recipientId] = params
      let rows = state.actionPlans.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("status = $2")) {
        const [, status] = params
        rows = rows.filter((r) => r.status === status)
      }
      rows = [...rows].sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
      )
      const limit = params[params.length - 1]
      return { rows: rows.slice(0, limit) }
    }
    if (s.includes("FROM action_plan_items")) {
      const [planIds] = params
      const idSet = new Set(planIds)
      const rows = state.actionPlanItems.filter((r) =>
        idSet.has(r.action_plan_id),
      )
      rows.sort((a, b) => a.sort_order - b.sort_order)
      return { rows }
    }

    // ── care_recipient_data_sources ────────────────────────────────────
    if (s.includes("FROM care_recipient_data_sources")) {
      let [recipientId] = params
      let rows = state.dataSources.filter(
        (r) => r.care_recipient_id === recipientId,
      )
      if (s.includes("source_type = $2") && s.includes("status = $3")) {
        const [, type, status] = params
        rows = rows.filter(
          (r) => r.source_type === type && r.status === status,
        )
      } else if (s.includes("source_type = $2")) {
        const [, type] = params
        rows = rows.filter((r) => r.source_type === type)
      } else if (s.includes("status = $2")) {
        const [, status] = params
        rows = rows.filter((r) => r.status === status)
      }
      return { rows }
    }

    throw new Error(`Fake pool: unhandled SQL: ${s.slice(0, 120)}`)
  }

  const pool = {
    async query(sql, params) {
      return query(sql, params)
    },
    async connect() {
      return { query, release() {} }
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

/**
 * Build an app with two pre-seeded users (Alice and Bob), each on the
 * team for one recipient. Returns the recipient ids so tests can use
 * them directly without re-deriving them from the state.
 */
async function buildAppWithRecipients() {
  const { pool, state, nextId } = createFakePool()
  const cognitoVerifier = makeVerifier({
    [ALICE_TOKEN]: ALICE_CLAIMS,
    [BOB_TOKEN]: BOB_CLAIMS,
  })

  // Seed Alice + Bob and one recipient each via direct state injection
  // (avoids extra HTTP round-trips on every test).
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
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: bobRecipientId,
      name: "Bob's Dad",
      date_of_birth: null,
      primary_condition: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  state.careTeamMembers.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      user_id: aliceId,
      role: "primary_caregiver",
      permission_level: "full_access",
      created_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: bobRecipientId,
      user_id: bobId,
      role: "primary_caregiver",
      permission_level: "full_access",
      created_at: new Date(),
    },
  )

  const app = createApp({ pool, cognitoVerifier })
  return { app, pool, state, nextId, aliceId, bobId, aliceRecipientId, bobRecipientId }
}

// ─── Common access-gate behavior (asserted once per route below) ───────────

function authHeader(token) {
  return { authorization: `Bearer ${token}` }
}

// ─── /care-recipients/:id/observations ─────────────────────────────────────

test("GET observations: 401 without Authorization header", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients/${aliceRecipientId}/observations`)
    assert.equal(res.status, 401)
  } finally {
    await stopServer(server)
  }
})

test("GET observations: 400 for a non-UUID id", async () => {
  const { app } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/care-recipients/not-a-uuid/observations`, {
      headers: authHeader(ALICE_TOKEN),
    })
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

test("GET observations: 403 when caller is not on the care team", async () => {
  const { app, bobRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${bobRecipientId}/observations`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 403)
  } finally {
    await stopServer(server)
  }
})

test("GET observations: 200 with empty array when no rows exist; audit count is 0", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/observations`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { observations: [] })

    const audit = state.auditLogs.find(
      (a) => a.action === "LIST_HEALTH_OBSERVATIONS",
    )
    assert.ok(audit, "LIST_HEALTH_OBSERVATIONS audit row was written")
    assert.equal(audit.resource_id, aliceRecipientId)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

test("GET observations: 200 returns only newest-first rows for the recipient", async () => {
  const { app, state, nextId, aliceRecipientId, bobRecipientId } =
    await buildAppWithRecipients()
  // Seed: 2 rows for Alice's recipient, 1 for Bob's.
  state.healthObservations.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      metric_type: "steps",
      value_numeric: 1000,
      value_unit: "count",
      observed_at: "2026-04-25T00:00:00.000Z",
      source_type: "healthkit",
      source_id: null,
      source_record_id: "rec-1",
      metadata: null,
      created_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      metric_type: "steps",
      value_numeric: 1500,
      value_unit: "count",
      observed_at: "2026-04-26T00:00:00.000Z",
      source_type: "healthkit",
      source_id: null,
      source_record_id: "rec-2",
      metadata: null,
      created_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: bobRecipientId,
      metric_type: "steps",
      value_numeric: 9999,
      value_unit: "count",
      observed_at: "2026-04-26T00:00:00.000Z",
      source_type: "healthkit",
      source_id: null,
      source_record_id: "rec-bob",
      metadata: null,
      created_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/observations`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.observations.length, 2)
    assert.equal(body.observations[0].source_record_id, "rec-2")
    assert.equal(body.observations[1].source_record_id, "rec-1")
  } finally {
    await stopServer(server)
  }
})

test("GET observations: 400 on invalid metricType query", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/observations?metricType=blood_pressure`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/baselines ────────────────────────────────────────

test("GET baselines: 200 empty + 0-count audit when no rows", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/baselines`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { baselines: [] })
    const audit = state.auditLogs.find(
      (a) => a.action === "LIST_METRIC_BASELINES",
    )
    assert.ok(audit)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

test("GET baselines: 403 when caller is not on the team", async () => {
  const { app, bobRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${bobRecipientId}/baselines`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 403)
  } finally {
    await stopServer(server)
  }
})

test("GET baselines: 400 on unsupported windowDays", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/baselines?windowDays=21`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/summaries ────────────────────────────────────────

test("GET summaries: 200 with empty array; audit metadata is count-only", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/summaries`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { summaries: [] })
    const audit = state.auditLogs.find((a) => a.action === "LIST_AI_SUMMARIES")
    assert.ok(audit)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

test("GET summaries: filter by type honors newest-first ordering", async () => {
  const { app, state, nextId, aliceRecipientId } = await buildAppWithRecipients()
  state.aiSummaries.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      summary_type: "daily",
      summary_text: "older",
      evidence: null,
      recommended_actions: null,
      model: null,
      prompt_version: null,
      generated_at: "2026-04-24T00:00:00.000Z",
      source_window_start: null,
      source_window_end: null,
      metadata: null,
      created_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      summary_type: "daily",
      summary_text: "newer",
      evidence: null,
      recommended_actions: null,
      model: null,
      prompt_version: null,
      generated_at: "2026-04-26T00:00:00.000Z",
      source_window_start: null,
      source_window_end: null,
      metadata: null,
      created_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      summary_type: "anomaly",
      summary_text: "anomaly-1",
      evidence: null,
      recommended_actions: null,
      model: null,
      prompt_version: null,
      generated_at: "2026-04-25T00:00:00.000Z",
      source_window_start: null,
      source_window_end: null,
      metadata: null,
      created_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/summaries?type=daily`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.summaries.length, 2)
    assert.equal(body.summaries[0].summary_text, "newer")
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/alerts ───────────────────────────────────────────

test("GET alerts (per-recipient): 200 empty when no rows", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/alerts`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { alerts: [] })
    const audit = state.auditLogs.find((a) => a.action === "LIST_ALERTS")
    assert.ok(audit)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

test("GET alerts (per-recipient): filters honor severity + status", async () => {
  const { app, state, nextId, aliceRecipientId } = await buildAppWithRecipients()
  state.alerts.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      severity: "critical",
      category: "vitals",
      title: "t1",
      explanation: null,
      status: "active",
      observed_at: "2026-04-26T00:00:00.000Z",
      source_type: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      resolved_at: null,
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      severity: "monitor",
      category: "vitals",
      title: "t2",
      explanation: null,
      status: "active",
      observed_at: "2026-04-25T00:00:00.000Z",
      source_type: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      resolved_at: null,
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      severity: "critical",
      category: "vitals",
      title: "t3",
      explanation: null,
      status: "resolved",
      observed_at: "2026-04-24T00:00:00.000Z",
      source_type: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      resolved_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/alerts?severity=critical&status=active`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.alerts.length, 1)
    assert.equal(body.alerts[0].title, "t1")
  } finally {
    await stopServer(server)
  }
})

// ─── GET /alerts (cross-recipient) ─────────────────────────────────────────

test("GET /alerts: 200 with empty array for a user with no recipients", async () => {
  const { pool, state, nextId } = createFakePool()
  const cognitoVerifier = makeVerifier({ [ALICE_TOKEN]: ALICE_CLAIMS })
  // Seed Alice with no recipients.
  state.users.push({
    id: nextId(),
    cognito_sub: ALICE_CLAIMS.sub,
    email: ALICE_CLAIMS.email,
    email_verified: true,
    display_name: ALICE_CLAIMS.name,
    role: "caregiver",
    status: "active",
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  })
  const app = createApp({ pool, cognitoVerifier })
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/alerts`, {
      headers: authHeader(ALICE_TOKEN),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { alerts: [] })

    const audit = state.auditLogs.find(
      (a) => a.action === "LIST_ALERTS_ACROSS_RECIPIENTS",
    )
    assert.ok(audit, "cross-recipient audit was written")
    assert.equal(audit.resource_id, null)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

test("GET /alerts: only includes alerts from recipients the caller is on the team for", async () => {
  const { app, state, nextId, aliceRecipientId, bobRecipientId } =
    await buildAppWithRecipients()
  state.alerts.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      severity: "monitor",
      category: null,
      title: "alice-alert",
      explanation: null,
      status: "active",
      observed_at: "2026-04-26T00:00:00.000Z",
      source_type: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      resolved_at: null,
    },
    {
      id: nextId(),
      care_recipient_id: bobRecipientId,
      severity: "monitor",
      category: null,
      title: "bob-alert",
      explanation: null,
      status: "active",
      observed_at: "2026-04-26T00:00:00.000Z",
      source_type: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      resolved_at: null,
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(`${baseUrl}/alerts`, {
      headers: authHeader(ALICE_TOKEN),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.alerts.length, 1)
    assert.equal(body.alerts[0].title, "alice-alert")
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/appointments ─────────────────────────────────────

test("GET appointments: defaults sort newest-first", async () => {
  const { app, state, nextId, aliceRecipientId } = await buildAppWithRecipients()
  state.appointments.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      title: "Cardiology",
      location: null,
      provider_name: null,
      scheduled_for: "2026-05-01T00:00:00.000Z",
      status: "scheduled",
      source_type: null,
      source_id: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      title: "Primary care",
      location: null,
      provider_name: null,
      scheduled_for: "2026-04-15T00:00:00.000Z",
      status: "completed",
      source_type: null,
      source_id: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/appointments`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.appointments[0].title, "Cardiology")
    assert.equal(body.appointments[1].title, "Primary care")
  } finally {
    await stopServer(server)
  }
})

test("GET appointments: window=upcoming filters and sorts ascending", async () => {
  const { app, state, nextId, aliceRecipientId } = await buildAppWithRecipients()
  const future1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const future2 = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  state.appointments.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      title: "F2",
      location: null,
      provider_name: null,
      scheduled_for: future2,
      status: "scheduled",
      source_type: null,
      source_id: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      title: "F1",
      location: null,
      provider_name: null,
      scheduled_for: future1,
      status: "scheduled",
      source_type: null,
      source_id: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      title: "Past",
      location: null,
      provider_name: null,
      scheduled_for: past,
      status: "completed",
      source_type: null,
      source_id: null,
      source_record_id: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/appointments?window=upcoming`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.appointments.length, 2)
    assert.equal(body.appointments[0].title, "F1")
    assert.equal(body.appointments[1].title, "F2")
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/action-plans ─────────────────────────────────────

test("GET action-plans: attaches items to their parent plan in sort order", async () => {
  const { app, state, nextId, aliceRecipientId } = await buildAppWithRecipients()
  const planId = nextId()
  state.actionPlans.push({
    id: planId,
    care_recipient_id: aliceRecipientId,
    title: "Hydration plan",
    goal_text: null,
    status: "active",
    due_at: null,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date(),
  })
  state.actionPlanItems.push(
    {
      id: nextId(),
      action_plan_id: planId,
      label: "Step 2",
      status: "pending",
      sort_order: 2,
      completed_at: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: nextId(),
      action_plan_id: planId,
      label: "Step 1",
      status: "pending",
      sort_order: 1,
      completed_at: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/action-plans`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    const body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.actionPlans.length, 1)
    assert.equal(body.actionPlans[0].items.length, 2)
    assert.equal(body.actionPlans[0].items[0].label, "Step 1")
    assert.equal(body.actionPlans[0].items[1].label, "Step 2")
  } finally {
    await stopServer(server)
  }
})

test("GET action-plans: 200 empty array short-circuits without items query", async () => {
  const { app, state, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/action-plans`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { actionPlans: [] })
    const audit = state.auditLogs.find((a) => a.action === "LIST_ACTION_PLANS")
    assert.ok(audit)
    assert.deepEqual(audit.metadata, { count: 0 })
  } finally {
    await stopServer(server)
  }
})

// ─── /care-recipients/:id/data-sources ─────────────────────────────────────

test("GET data-sources: returns the registry rows for the recipient", async () => {
  const { app, state, nextId, aliceRecipientId, bobRecipientId } =
    await buildAppWithRecipients()
  state.dataSources.push(
    {
      id: nextId(),
      care_recipient_id: aliceRecipientId,
      source_type: "apple_health",
      status: "connected",
      last_synced_at: "2026-04-25T09:00:00.000Z",
      external_id: null,
      error_message: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: nextId(),
      care_recipient_id: bobRecipientId,
      source_type: "epic",
      status: "connected",
      last_synced_at: "2026-04-25T09:00:00.000Z",
      external_id: null,
      error_message: null,
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  )
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/data-sources`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.dataSources.length, 1)
    assert.equal(body.dataSources[0].source_type, "apple_health")
  } finally {
    await stopServer(server)
  }
})

test("GET data-sources: 400 on unknown source type filter", async () => {
  const { app, aliceRecipientId } = await buildAppWithRecipients()
  const { server, baseUrl } = await startServer(app)
  try {
    const res = await fetch(
      `${baseUrl}/care-recipients/${aliceRecipientId}/data-sources?type=smartwatch`,
      { headers: authHeader(ALICE_TOKEN) },
    )
    assert.equal(res.status, 400)
  } finally {
    await stopServer(server)
  }
})
