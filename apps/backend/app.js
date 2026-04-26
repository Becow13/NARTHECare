import express from "express"
import {
  healthDataService,
  authService,
  careRecipientService,
  careRecipientProfileService,
  auditService,
} from "./services/index.js"
import { MAX_PAYLOAD_BYTES } from "./lib/health-data.js"
import { extractBearerToken } from "./lib/cognito-auth.js"
import { extractRequestContext, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "./lib/audit.js"
import { IdentityEmailConflictError } from "./lib/identity-errors.js"
import { CareRecipientAccessError } from "./services/careRecipientService.js"
import { CareRecipientProfileAccessError } from "./services/careRecipientProfileService.js"

/**
 * Build the Express application.
 *
 * The `pool` and `cognitoVerifier` are both injected so integration tests can
 * supply fakes without touching the real database or reaching out to the
 * Cognito JWKS endpoint. Keeping the app factory separate from the HTTP
 * bootstrap (see `server.js`) also means `createApp` can be reused by any
 * future entry point (CLI smoke test, Lambda adapter, etc.).
 *
 * `cognitoVerifier` must expose `verify(token)` that resolves with the
 * verified claims or throws on any failure — mirrors the shape returned by
 * `authService.createCognitoVerifier`. It may be `null` when the dev auth
 * bypass is active; the middleware then skips JWT verification entirely.
 *
 * `devAuthBypass`, when truthy, must be `{ user, role }` where `user` is a
 * pre-seeded row from the internal `users` table (see
 * `authService.ensureDevUser`). The server bootstrap only populates it when
 * `DEV_AUTH_BYPASS=true` AND `NODE_ENV !== "production"` — the gate lives in
 * `lib/dev-auth.js` so production can never opt in by accident.
 */
export function createApp({ pool, cognitoVerifier, devAuthBypass = null }) {
  const app = express()
  app.use(express.json({ limit: MAX_PAYLOAD_BYTES }))

  const requireCognitoUser = _buildRequireCognitoUser({
    pool,
    cognitoVerifier,
    devAuthBypass,
  })

  // ─── GET /health ────────────────────────────────────────────────────────
  // Liveness probe for Aptible's endpoint and any future load balancer.
  // Intentionally:
  //   - unauthenticated — the probe does not carry Cognito tokens
  //   - no DB round-trip — a transient Postgres blip must not take the
  //     whole app out of rotation (readiness/DB health lives elsewhere)
  //   - no PHI and no request-scoped fields in the response
  //   - silent — do not log probe traffic; probes hit this route every few
  //     seconds and would drown out real events in the audit/app logs.
  // TODO(observability): add a separate `/ready` endpoint that does a
  // shallow `SELECT 1` once we have a readiness vs liveness split, and
  // wire an audit entry only for startup/shutdown transitions.
  app.get("/health", (_req, res) => {
    return res.json({ status: "ok" })
  })

  // ─── Legacy unauthenticated HealthKit ingest ────────────────────────────
  // Kept on its pre-Cognito contract so the existing iOS client keeps
  // working while the authenticated endpoints land behind a feature flag.
  // TODO: move this behind `requireCognitoUser` once the iOS client ships
  // Cognito tokens.
  app.post("/health-data", async (req, res) => {
    try {
      const userId = req.body?.userId
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId (string) is required" })
      }

      let result
      try {
        result = await healthDataService.saveHealthData(pool, userId, req.body)
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : "Invalid payload",
        })
      }

      return res.json({ success: true, ...result })
    } catch (e) {
      console.error("[API health-data]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to store health data",
      })
    }
  })

  // ─── GET /api/me (and legacy /me alias) ────────────────────────────────
  //
  // The middleware already upserted the `users` row from the verified
  // Cognito claims. This handler only needs to:
  //
  //   1. Stamp `last_login_at = NOW()` so the column reflects "last
  //      completed Cognito sign-in" rather than "last authenticated
  //      request" (which would tick on every API call).
  //   2. Write an `AUTHENTICATE_USER` audit row with NO PHI in the
  //      metadata column — every actor / resource id is already
  //      indexed for ops queries, and emails / tokens / Cognito claims
  //      must never land in `audit_logs`.
  //   3. Return the safe public profile to the iOS client.
  //
  // The legacy `/me` alias is preserved because earlier integration
  // tests and the in-flight iOS build target it; new clients should
  // call `/api/me`. TODO(api): retire `/me` once every shipped iOS
  // build targets `/api/me`.

  app.get(["/api/me", "/me"], requireCognitoUser, async (req, res) => {
    try {
      const refreshed = await authService.recordLogin(pool, req.user.id)
      // If the row vanished between middleware and handler (e.g. a delete
      // ran in another connection), fail closed with 401 instead of 200.
      if (!refreshed) {
        return res.status(401).json({ error: "Invalid or expired token" })
      }

      const { ipAddress, userAgent } = extractRequestContext(req)
      await auditService.logAction(pool, {
        actorUserId: refreshed.id,
        action: AUDIT_ACTIONS.authenticateUser,
        resourceType: AUDIT_RESOURCE_TYPES.user,
        resourceId: refreshed.id,
        // Intentionally null — never log emails, sub values, or Cognito
        // claim contents in audit metadata.
        metadata: null,
        ipAddress,
        userAgent,
      })

      return res.json({ user: _publicUser(refreshed) })
    } catch (e) {
      console.error("[API me]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to load user",
      })
    }
  })

  // ─── POST /care-recipients ──────────────────────────────────────────────

  app.post("/care-recipients", requireCognitoUser, async (req, res) => {
    try {
      let result
      try {
        result = await careRecipientService.createCareRecipient(
          pool,
          req.user.id,
          req.body,
        )
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : "Invalid payload",
        })
      }

      const { ipAddress, userAgent } = extractRequestContext(req)
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.createCareRecipient,
        resourceType: AUDIT_RESOURCE_TYPES.careRecipient,
        resourceId: result.careRecipient.id,
        metadata: { name: result.careRecipient.name },
        ipAddress,
        userAgent,
      })

      return res.status(201).json({
        success: true,
        careRecipient: result.careRecipient,
        careTeamMember: result.careTeamMember,
      })
    } catch (e) {
      console.error("[API care-recipients POST]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to create care recipient",
      })
    }
  })

  // ─── GET /care-recipients ───────────────────────────────────────────────

  app.get("/care-recipients", requireCognitoUser, async (req, res) => {
    try {
      const rows = await careRecipientService.listCareRecipientsForUser(
        pool,
        req.user.id,
      )

      const { ipAddress, userAgent } = extractRequestContext(req)
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.listCareRecipients,
        resourceType: AUDIT_RESOURCE_TYPES.careRecipient,
        resourceId: null,
        metadata: { count: rows.length },
        ipAddress,
        userAgent,
      })

      return res.json({ careRecipients: rows })
    } catch (e) {
      console.error("[API care-recipients GET]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to list care recipients",
      })
    }
  })

  // ─── GET /care-recipients/:id/profile ──────────────────────────────────
  // Registered BEFORE `/care-recipients/:id` so Express's path matcher does
  // not capture "profile" as the id. Returns the full `CareRecipientProfile`
  // contract (see `shared/models/CareRecipientProfile.ts`) — today the
  // body comes from a mock module, but the service layer's call-site is
  // already the final shape so the switch-over to real tables is one file.

  app.get("/care-recipients/:id/profile", requireCognitoUser, async (req, res) => {
    try {
      const { id } = req.params
      if (!_isUuid(id)) {
        return res.status(400).json({ error: "Invalid care recipient id" })
      }

      try {
        await careRecipientProfileService.requireProfileAccess(pool, id, req.user.id)
      } catch (e) {
        if (e instanceof CareRecipientProfileAccessError) {
          return res.status(403).json({ error: e.message })
        }
        throw e
      }

      const profile = await careRecipientProfileService.getCareRecipientProfile(pool, id)
      if (!profile) {
        return res.status(404).json({ error: "Care recipient not found" })
      }

      const { ipAddress, userAgent } = extractRequestContext(req)
      // Audit metadata intentionally excludes `name`, notes, baselines, and
      // every other PHI field — only internal ids + non-PHI counts may land
      // in `audit_logs.metadata`.
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.viewCareRecipientProfile,
        resourceType: AUDIT_RESOURCE_TYPES.careRecipient,
        resourceId: profile.id,
        metadata: null,
        ipAddress,
        userAgent,
      })

      return res.json({ careRecipient: profile })
    } catch (e) {
      console.error("[API care-recipients/:id/profile]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to load care recipient profile",
      })
    }
  })

  // ─── GET /care-recipients/:id ───────────────────────────────────────────

  app.get("/care-recipients/:id", requireCognitoUser, async (req, res) => {
    try {
      const { id } = req.params
      if (!_isUuid(id)) {
        return res.status(400).json({ error: "Invalid care recipient id" })
      }

      try {
        await careRecipientService.requireCareRecipientAccess(pool, id, req.user.id)
      } catch (e) {
        if (e instanceof CareRecipientAccessError) {
          return res.status(403).json({ error: e.message })
        }
        throw e
      }

      const recipient = await careRecipientService.getCareRecipientForUser(
        pool,
        id,
        req.user.id,
      )
      if (!recipient) {
        return res.status(404).json({ error: "Care recipient not found" })
      }

      const { ipAddress, userAgent } = extractRequestContext(req)
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.viewCareRecipient,
        resourceType: AUDIT_RESOURCE_TYPES.careRecipient,
        resourceId: recipient.id,
        metadata: null,
        ipAddress,
        userAgent,
      })

      return res.json({ careRecipient: recipient })
    } catch (e) {
      console.error("[API care-recipients/:id]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to load care recipient",
      })
    }
  })

  return app
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Build the Cognito JWT middleware bound to a specific verifier + pool.
 *
 * Returned middleware reads `Authorization: Bearer <token>`, verifies the
 * JWT via `cognitoVerifier.verify`, upserts the internal `users` row, and
 * attaches `req.user` as the canonical internal identity. Every failure
 * path returns 401 with a short message so a probing attacker cannot
 * distinguish between missing token, bad signature, and expired token.
 *
 * The verifier is checked lazily at request time (rather than at app build)
 * so unauthenticated-only entry points — e.g. the existing health-data
 * integration harness — can still build the app without wiring Cognito.
 *
 * When `devAuthBypass` is set the middleware short-circuits Cognito
 * entirely and attaches the pre-seeded dev user to `req.user`. The bypass
 * path is gated at bootstrap time (see `lib/dev-auth.js`) so production
 * can never reach it, even if a caller forgets to set `cognitoVerifier`.
 *
 * TODO(cognito): remove the bypass branch once real COGNITO_* env vars
 * exist in every environment and the iOS client always sends tokens.
 */
function _buildRequireCognitoUser({ pool, cognitoVerifier, devAuthBypass }) {
  return async function requireCognitoUser(req, res, next) {
    // TODO(cognito): drop this branch when DEV_AUTH_BYPASS is retired.
    if (devAuthBypass) {
      req.user = { ...devAuthBypass.user, role: devAuthBypass.role }
      return next()
    }
    if (!cognitoVerifier || typeof cognitoVerifier.verify !== "function") {
      console.error("[auth] cognitoVerifier not configured")
      return res.status(500).json({ error: "Auth not configured" })
    }
    const token = extractBearerToken(req.headers.authorization)
    if (!token) {
      return res.status(401).json({ error: "Missing or malformed Authorization header" })
    }
    let claims
    try {
      claims = await cognitoVerifier.verify(token)
    } catch (e) {
      // Do not leak the verifier's detailed message; log for ops.
      console.error("[auth] token verification failed", e instanceof Error ? e.message : e)
      return res.status(401).json({ error: "Invalid or expired token" })
    }
    let user
    try {
      user = await authService.findOrCreateUserFromCognitoClaims(pool, claims, {
        req,
      })
    } catch (e) {
      if (e instanceof IdentityEmailConflictError) {
        return res.status(409).json({
          error: e instanceof Error ? e.message : "Account conflict",
        })
      }
      console.error("[auth] user upsert failed", e)
      return res.status(401).json({ error: "Invalid or expired token" })
    }
    req.user = user
    return next()
  }
}

/**
 * Project a `users` row to the safe shape returned to the iOS client.
 *
 * Intentionally excludes `cognito_sub`, raw Cognito claims, tokens, and
 * any operational columns the client has no business seeing. The result
 * is passed through `JSON.stringify`, so any future column added to the
 * table is omitted by default — fail-closed against accidental PHI
 * leakage through new schema fields.
 */
function _publicUser(row) {
  return {
    id: row.id,
    email: row.email ?? null,
    email_verified: Boolean(row.email_verified),
    display_name: row.display_name ?? null,
    role: row.role,
    status: row.status,
    last_login_at: row.last_login_at ?? null,
    created_at: row.created_at,
  }
}

// RFC-4122 form — any case, with hyphens. We do not need to validate version.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function _isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value)
}
