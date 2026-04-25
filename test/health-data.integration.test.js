import test from "node:test"
import assert from "node:assert/strict"
import { createApp } from "../app.js"

// ─── Test harness ─────────────────────────────────────────────────────────────

/**
 * Start the Express app on an ephemeral port so each test gets an isolated
 * server. Returns both the server handle (for teardown) and the baseUrl so
 * tests can issue real HTTP requests via `fetch`.
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

/** Minimal pg-pool-shaped fake that records every SQL statement issued. */
function createRecordingPool() {
  const queries = []
  const mockClient = {
    async query(sql, params) {
      queries.push({ sql, params })
    },
    release() {},
  }
  const mockPool = {
    async connect() {
      return mockClient
    },
  }
  return { pool: mockPool, queries }
}

// ─── POST /health-data — happy path ───────────────────────────────────────────

test("POST /health-data stores rows and commits", async () => {
  const { pool, queries } = createRecordingPool()
  const app = createApp({ pool })
  const { server, baseUrl } = await startServer(app)

  try {
    const res = await fetch(`${baseUrl}/health-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user-1",
        steps: [{ value: 1234, date: "2026-04-25T00:00:00.000Z" }],
        heartRate: [{ value: 70, date: "2026-04-25T01:00:00.000Z" }],
        sleep: [{ value: 7.25, date: "2026-04-24T22:00:00.000Z" }],
      }),
    })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.deepEqual(body, { success: true, inserted: 3 })
    assert.equal(queries[0].sql, "BEGIN")
    assert.equal(queries.at(-1).sql, "COMMIT")
    assert.equal(
      queries.filter((q) => q.sql.includes("INSERT INTO health_data")).length,
      3,
    )
  } finally {
    await stopServer(server)
  }
})

// ─── POST /health-data — validation ──────────────────────────────────────────

test("POST /health-data returns 400 for invalid payload", async () => {
  const pool = {
    async connect() {
      throw new Error("DB should not be called for invalid payload")
    },
  }
  const app = createApp({ pool })
  const { server, baseUrl } = await startServer(app)

  try {
    const res = await fetch(`${baseUrl}/health-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user-1",
        steps: [{ value: 100, date: "not-a-date" }],
      }),
    })
    const body = await res.json()

    assert.equal(res.status, 400)
    assert.match(body.error, /Invalid date/)
  } finally {
    await stopServer(server)
  }
})

test("POST /health-data returns 400 when userId is missing", async () => {
  const { pool } = createRecordingPool()
  const app = createApp({ pool })
  const { server, baseUrl } = await startServer(app)

  try {
    const res = await fetch(`${baseUrl}/health-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steps: [] }),
    })
    const body = await res.json()

    assert.equal(res.status, 400)
    assert.match(body.error, /userId/)
  } finally {
    await stopServer(server)
  }
})
