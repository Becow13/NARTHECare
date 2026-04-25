/**
 * Local dev launcher: opens an Aptible DB tunnel on a pinned port, waits for
 * it to be reachable, then starts the API with `node --watch`.
 *
 * We pin the local port (default 5433) so `.env`'s DATABASE_URL stays valid
 * across sessions — `aptible db:tunnel` without `--port` picks a random free
 * port each run, which would require editing `.env` every time.
 *
 * `npm start` intentionally stays a plain `node server.js` so the Aptible
 * deploy (where there is no tunnel) keeps working unchanged. Use this script
 * only for local development via `npm run dev`.
 */
import { spawn } from "node:child_process"
import process from "node:process"

const DB_HANDLE = process.env.APTIBLE_DB_HANDLE ?? "narthecare-postgresql"
const TUNNEL_PORT = Number(process.env.APTIBLE_TUNNEL_PORT) || 5433
const TUNNEL_READY_MS = 60_000

/**
 * Spawn `aptible db:tunnel` and resolve once it prints "Connected.".
 *
 * Rejects if the CLI exits before announcing readiness, or if it takes
 * longer than `TUNNEL_READY_MS` (which usually means auth has expired and
 * the user needs to `aptible login`).
 *
 * The child runs in its own process group (`detached: true`) so a single
 * `process.kill(-pid)` on shutdown reaches the Ruby CLI *and* the `ssh`
 * subprocess it forks — a plain SIGINT to the Ruby parent does not
 * propagate to ssh and would leave an orphaned tunnel listening on the port.
 */
function startTunnel() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "aptible",
      ["db:tunnel", DB_HANDLE, "--port", String(TUNNEL_PORT)],
      { stdio: ["ignore", "pipe", "pipe"], detached: true }
    )

    let ready = false
    const timer = setTimeout(() => {
      if (!ready) {
        child.kill("SIGINT")
        reject(
          new Error(
            `[dev] tunnel to ${DB_HANDLE} did not become ready within ${TUNNEL_READY_MS}ms`
          )
        )
      }
    }, TUNNEL_READY_MS)

    const forward = (buf) => {
      const text = buf.toString()
      process.stdout.write(`[tunnel] ${text}`)
      if (!ready && text.includes("Connected.")) {
        ready = true
        clearTimeout(timer)
        resolve(child)
      }
    }

    child.stdout.on("data", forward)
    child.stderr.on("data", forward)

    child.on("exit", (code, signal) => {
      if (!ready) {
        clearTimeout(timer)
        reject(
          new Error(
            `[dev] aptible db:tunnel exited before becoming ready (code=${code}, signal=${signal})`
          )
        )
      }
    })
  })
}

/**
 * Spawn the API server as a watched child, inheriting stdio so logs render
 * normally. Detached so we can group-kill it alongside the tunnel on exit
 * without leaving `node --watch`'s forked worker behind.
 */
function startServer() {
  return spawn("node", ["--watch", "server.js"], {
    stdio: "inherit",
    detached: true,
  })
}

/**
 * Kill a detached child's entire process group. Swallows errors so a
 * second shutdown pass (e.g. SIGTERM after SIGINT) is safe.
 */
function killGroup(child, signal) {
  if (!child || child.killed || child.pid == null) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}

async function main() {
  console.log(
    `[dev] opening tunnel to ${DB_HANDLE} on localhost.aptible.in:${TUNNEL_PORT}...`
  )
  const tunnel = await startTunnel()
  console.log("[dev] tunnel ready; starting API server")

  const server = startServer()

  const shutdown = (signal) => {
    console.log(`[dev] received ${signal}; shutting down`)
    killGroup(server, signal)
    killGroup(tunnel, signal)
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))

  server.on("exit", (code, signal) => {
    console.log(`[dev] server exited (code=${code}, signal=${signal})`)
    killGroup(tunnel, "SIGINT")
    process.exit(code ?? 0)
  })
  tunnel.on("exit", (code, signal) => {
    console.log(`[dev] tunnel exited (code=${code}, signal=${signal})`)
    killGroup(server, "SIGINT")
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error("[dev] fatal", err)
  process.exit(1)
})
