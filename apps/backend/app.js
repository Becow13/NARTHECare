import express from "express"
import {
  healthDataService,
  authService,
  careRecipientService,
  careRecipientProfileService,
  auditService,
  healthObservationService,
  metricBaselineService,
  aiSummaryService,
  alertService,
  appointmentService,
  actionPlanService,
  careRecipientDataSourceService,
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

  // ─── POST /healthkit/sync ──────────────────────────────────────────────
  // Phase 4A entry point for the iOS HealthKit sync companion. The body
  // shape is validated against `shared/contracts/healthObservation.schema.json`
  // (mirrored as `shared/models/HealthObservation.{ts,js}` and the iOS
  // Codable struct). Both the Cognito JWT AND care-team membership are
  // checked before any DB write — `careRecipientId` lives in the body
  // and is the access-gate target.
  //
  // Audit metadata carries `{ accepted, deduped, rejected, metricTypes }`
  // only — never values, never source_record_ids, never timestamps of
  // individual samples. Body bytes are never logged.
  app.post("/healthkit/sync", requireCognitoUser, async (req, res) => {
    try {
      const recipientId =
        req.body?.careRecipientId ?? req.body?.care_recipient_id
      if (!_isUuid(recipientId)) {
        return res.status(400).json({
          error: "careRecipientId (uuid string) is required",
        })
      }

      try {
        await careRecipientService.requireCareRecipientAccess(
          pool,
          recipientId,
          req.user.id,
        )
      } catch (e) {
        if (e instanceof CareRecipientAccessError) {
          return res.status(403).json({ error: e.message })
        }
        throw e
      }

      let result
      try {
        result = await healthObservationService.syncHealthkitObservations(
          pool,
          recipientId,
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
        action: AUDIT_ACTIONS.syncHealthkitObservations,
        resourceType: AUDIT_RESOURCE_TYPES.healthObservation,
        resourceId: recipientId,
        metadata: {
          accepted: result.accepted,
          deduped: result.deduped,
          rejected: result.rejected,
          metricTypes: result.metricTypes,
        },
        ipAddress,
        userAgent,
      })

      return res.json({
        accepted: result.accepted,
        deduped: result.deduped,
        rejected: result.rejected,
        lastSyncedAt: result.lastSyncedAt,
      })
    } catch (e) {
      console.error("[API healthkit-sync]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to sync observations",
      })
    }
  })

  // ─── GET /healthkit/status ─────────────────────────────────────────────
  // Drives the iOS sync-status surface and (Phase 4A web add) the
  // dashboard's Data Sources card. Returns the shape every caller
  // needs (`status`, `lastSyncedAt`, `errorMessage`) regardless of
  // whether the registry row exists yet — a never-synced recipient
  // gets a neutral `not_connected` envelope, never a 404.
  app.get("/healthkit/status", requireCognitoUser, async (req, res) => {
    try {
      const recipientId = req.query?.careRecipientId ?? req.query?.care_recipient_id
      if (typeof recipientId !== "string" || !_isUuid(recipientId)) {
        return res.status(400).json({
          error: "careRecipientId (uuid string) is required",
        })
      }

      try {
        await careRecipientService.requireCareRecipientAccess(
          pool,
          recipientId,
          req.user.id,
        )
      } catch (e) {
        if (e instanceof CareRecipientAccessError) {
          return res.status(403).json({ error: e.message })
        }
        throw e
      }

      const status = await healthObservationService.getHealthkitSyncStatus(
        pool,
        recipientId,
      )

      const { ipAddress, userAgent } = extractRequestContext(req)
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.viewHealthkitStatus,
        resourceType: AUDIT_RESOURCE_TYPES.dataSource,
        resourceId: recipientId,
        metadata: null,
        ipAddress,
        userAgent,
      })

      return res.json(status)
    } catch (e) {
      console.error("[API healthkit-status]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to load sync status",
      })
    }
  })

  // ─── Legacy unauthenticated HealthKit ingest ────────────────────────────
  // Kept on its pre-Cognito contract so the existing iOS client keeps
  // working while the authenticated endpoints land behind a feature flag.
  // TODO: remove once every shipped iOS build targets the Phase 4A
  // `POST /care-recipients/:id/healthkit/sync` route AND the cleanup
  // step after Phase 4B has back-filled historical `health_data` rows
  // into `health_observations`.
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

  // ─── Phase 4 read endpoints ────────────────────────────────────────────
  // Each handler:
  //   1. validates the `:id` is UUID-shaped (→ 400 otherwise),
  //   2. gates on `requireCareRecipientAccess` (→ 403; collapses
  //      "no membership" and "no such recipient" so existence is not
  //      leaked — same convention as `GET /care-recipients/:id`),
  //   3. parses the query string in a pure helper (→ 400 on bad input),
  //   4. fetches via the service (always returns an array, possibly
  //      empty — Phase 4A / 4B will populate the underlying tables),
  //   5. writes a single audit row with `metadata = { count }` only.
  //      No PHI (metric values, summary text, alert titles, etc.) ever
  //      lands in `audit_logs.metadata`.

  // ─── GET /care-recipients/:id/observations ─────────────────────────────

  app.get(
    "/care-recipients/:id/observations",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await healthObservationService.listObservationsForRecipient(
            pool,
            id,
            req.query,
          )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listHealthObservations,
          resourceType: AUDIT_RESOURCE_TYPES.healthObservation,
          resourceId: id,
          metadata: { count: result.observations.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/observations]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load observations",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/baselines ────────────────────────────────

  app.get(
    "/care-recipients/:id/baselines",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await metricBaselineService.listBaselinesForRecipient(
            pool,
            id,
            req.query,
          )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listMetricBaselines,
          resourceType: AUDIT_RESOURCE_TYPES.metricBaseline,
          resourceId: id,
          metadata: { count: result.baselines.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/baselines]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load baselines",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/summaries ────────────────────────────────

  app.get(
    "/care-recipients/:id/summaries",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await aiSummaryService.listSummariesForRecipient(
            pool,
            id,
            req.query,
          )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        // Summary text is PHI — `metadata` carries only the count so
        // analytics can ask "how often did caregiver X read summaries?"
        // without ever touching the model output.
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listAiSummaries,
          resourceType: AUDIT_RESOURCE_TYPES.aiSummary,
          resourceId: id,
          metadata: { count: result.summaries.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/summaries]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load summaries",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/alerts ───────────────────────────────────

  app.get(
    "/care-recipients/:id/alerts",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await alertService.listAlertsForRecipient(pool, id, req.query)
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listAlerts,
          resourceType: AUDIT_RESOURCE_TYPES.alert,
          resourceId: id,
          metadata: { count: result.alerts.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/alerts]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load alerts",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/appointments ─────────────────────────────

  app.get(
    "/care-recipients/:id/appointments",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await appointmentService.listAppointmentsForRecipient(
            pool,
            id,
            req.query,
          )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listAppointments,
          resourceType: AUDIT_RESOURCE_TYPES.appointment,
          resourceId: id,
          metadata: { count: result.appointments.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/appointments]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load appointments",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/action-plans ─────────────────────────────

  app.get(
    "/care-recipients/:id/action-plans",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result = await actionPlanService.listActionPlansForRecipient(
            pool,
            id,
            req.query,
          )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listActionPlans,
          resourceType: AUDIT_RESOURCE_TYPES.actionPlan,
          resourceId: id,
          metadata: { count: result.actionPlans.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/action-plans]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load action plans",
        })
      }
    },
  )

  // ─── GET /care-recipients/:id/data-sources ─────────────────────────────

  app.get(
    "/care-recipients/:id/data-sources",
    requireCognitoUser,
    async (req, res) => {
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

        let result
        try {
          result =
            await careRecipientDataSourceService.listDataSourcesForRecipient(
              pool,
              id,
              req.query,
            )
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid query",
          })
        }

        const { ipAddress, userAgent } = extractRequestContext(req)
        await auditService.logAction(pool, {
          actorUserId: req.user.id,
          action: AUDIT_ACTIONS.listDataSources,
          resourceType: AUDIT_RESOURCE_TYPES.dataSource,
          resourceId: id,
          metadata: { count: result.dataSources.length },
          ipAddress,
          userAgent,
        })

        return res.json(result)
      } catch (e) {
        console.error("[API care-recipients/:id/data-sources]", e)
        return res.status(500).json({
          error: e instanceof Error ? e.message : "Failed to load data sources",
        })
      }
    },
  )

  // ─── GET /alerts ───────────────────────────────────────────────────────
  // Cross-recipient alert feed for the dashboard's `/alerts` route. The
  // service derives the user's accessible care_recipient_ids from the
  // existing `care_team_members` join — the SQL never sees a recipient
  // the caller is not on the team for, so a 200 with 0 rows is the
  // honest answer for "user has no recipients yet".

  app.get("/alerts", requireCognitoUser, async (req, res) => {
    try {
      let result
      try {
        result = await alertService.listAlertsForUser(pool, req.user.id, req.query)
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : "Invalid query",
        })
      }

      const { ipAddress, userAgent } = extractRequestContext(req)
      // No `resource_id` — this is a cross-recipient list; analytics
      // should still be able to count "user X read the alerts feed".
      await auditService.logAction(pool, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.listAlertsAcrossRecipients,
        resourceType: AUDIT_RESOURCE_TYPES.alert,
        resourceId: null,
        metadata: { count: result.alerts.length },
        ipAddress,
        userAgent,
      })

      return res.json(result)
    } catch (e) {
      console.error("[API alerts]", e)
      return res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to load alerts",
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
