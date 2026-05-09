/**
 * Application-layer rate limiting helpers.
 *
 * Three tiers are exposed:
 *   - `globalLimiter`  – broad IP-based guard for all routes (DDoS / scraping)
 *   - `syncLimiter`    – tighter ceiling for the HealthKit batch-sync endpoint,
 *     which can push large payloads and must not be hammered by a rogue device
 *   - `authLimiter`    – stricter limit for authentication-adjacent routes to
 *     slow credential-stuffing and enumeration attacks
 *
 * All limiters use a standard `draft-7` `RateLimit-*` response header so
 * clients and proxies can honour the limits without parsing a custom error.
 *
 * IMPORTANT: These are application-layer safeguards only.  Production
 * deployments SHOULD also enforce limits at the load-balancer / WAF layer
 * so that rate limit checks cannot be bypassed by direct socket access.
 */

import { rateLimit } from "express-rate-limit"

/** Maximum requests per window for each tier, overridable via environment. */
const GLOBAL_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 300
const SYNC_MAX = Number(process.env.RATE_LIMIT_SYNC_MAX) || 60
const AUTH_MAX = Number(process.env.RATE_LIMIT_AUTH_MAX) || 20

/** Window duration in milliseconds (15 minutes) */
const WINDOW_MS = 15 * 60 * 1000

/** Window duration for the sync endpoint (1 minute) */
const SYNC_WINDOW_MS = 60 * 1000

/**
 * Generic handler that returns the same opaque error shape used by the rest
 * of the API so clients cannot distinguish a rate-limit 429 from any other
 * error response.
 *
 * @param {import("express").Request}  _req
 * @param {import("express").Response} res
 */
function onLimitReached(_req, res) {
  res.status(429).json({ error: "Too many requests. Please try again later." })
}

/**
 * Broad per-IP limiter applied to every route.
 *
 * Default: 300 requests per 15 minutes per IP address.
 * Override via `RATE_LIMIT_GLOBAL_MAX` environment variable.
 */
export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: GLOBAL_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: onLimitReached,
  // Skip the unauthenticated liveness probe — probes run every few seconds
  // and must never be blocked by the limiter.
  skip: (req) => req.path === "/health",
})

/**
 * Tighter per-IP limiter for the HealthKit batch-sync endpoint.
 *
 * Default: 60 requests per 1 minute per IP address.
 * Override via `RATE_LIMIT_SYNC_MAX` environment variable.
 */
export const syncLimiter = rateLimit({
  windowMs: SYNC_WINDOW_MS,
  max: SYNC_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: onLimitReached,
})

/**
 * Strict per-IP limiter for auth-adjacent routes (token exchange, user
 * profile writes) to deter credential stuffing and enumeration.
 *
 * Default: 20 requests per 15 minutes per IP address.
 * Override via `RATE_LIMIT_AUTH_MAX` environment variable.
 */
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: AUTH_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: onLimitReached,
})
