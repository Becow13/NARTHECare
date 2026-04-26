/**
 * SMART on FHIR integration — placeholder module.
 *
 * This file intentionally contains no runtime behaviour yet. It exists to
 * pin the eventual public surface so the Cognito-auth layer above can be
 * written against the final shape without churn. Every exported function
 * here throws `"not implemented"` so a caller wiring it in prematurely
 * fails loudly instead of silently no-oping.
 *
 * Non-goals for this file:
 *   - Do not add any real network I/O.
 *   - Do not register routes on the Express app.
 *   - Do not read or write DB state.
 *
 * When a real MyChart / Epic integration lands, the replacement must keep
 * this module boundary so the route handler in `app.js` can stay unaware
 * of the EHR vendor.
 */

// ─── Connect MyChart (user-initiated OAuth launch) ───────────────────────────

// TODO: Connect MyChart
//   - Accept the internal NARTHECare user id + a care_recipient_id.
//   - Resolve the patient's home FHIR endpoint (Epic's OpenEpic registry, or
//     a user-selected provider).
//   - Build a SMART on FHIR authorize URL with the right scopes
//     (`launch/patient`, `patient/*.read`, `openid`, `fhirUser`, etc.) and
//     a one-time `state` tied to the session.
//   - Persist the pending state so the callback can correlate it safely.
export async function startMyChartConnect(/* pool, userId, careRecipientId, options */) {
  throw new Error("startMyChartConnect: not implemented")
}

// ─── OAuth callback ──────────────────────────────────────────────────────────

// TODO: OAuth callback
//   - Validate the returned `state` against the stored pending-state row;
//     reject mismatches with a 400.
//   - Exchange the authorization code for an access + refresh token at the
//     provider's token endpoint.
//   - Hand the token payload to `storeFhirTokens()` below.
//   - Return the internal `fhir_connection_id` so the client can poll status.
export async function handleOAuthCallback(/* pool, { code, state, iss } */) {
  throw new Error("handleOAuthCallback: not implemented")
}

// ─── Encrypted token storage ─────────────────────────────────────────────────

// TODO: encrypted token storage
//   - Introduce a `fhir_connections` table keyed by (user_id, care_recipient_id).
//   - Encrypt access/refresh tokens at rest with an app-side KMS key (do NOT
//     store them in plaintext, even in the JSONB metadata column).
//   - Store non-sensitive metadata separately so list/status endpoints can
//     render without decrypting.
export async function storeFhirTokens(/* pool, connectionId, tokens */) {
  throw new Error("storeFhirTokens: not implemented")
}

// ─── Refresh token logic ─────────────────────────────────────────────────────

// TODO: refresh token logic
//   - When access_token is within N minutes of expiry, call the provider's
//     token endpoint with grant_type=refresh_token.
//   - Persist the rotated refresh token if one is returned (Epic sometimes
//     rotates, sometimes doesn't).
//   - Mark the connection `disconnected` on an irrecoverable refresh failure
//     so the iOS client can prompt the user to reconnect MyChart.
export async function refreshAccessToken(/* pool, connectionId */) {
  throw new Error("refreshAccessToken: not implemented")
}

// ─── FHIR data sync ──────────────────────────────────────────────────────────

// TODO: FHIR patient data sync
//   - Pull Patient, Observation, Condition, MedicationRequest, AllergyIntolerance
//     resources for the connected patient id.
//   - Map each FHIR resource to the internal schema (health_background,
//     baseline, data source metadata). Audit-log every read with the
//     connection id, never the raw FHIR payload.
//   - Respect the rate limits of the provider; fall back to delta fetches
//     keyed on `_lastUpdated` when supported.
//   - Never log PHI or tokens from this path.
export async function syncFhirData(/* pool, connectionId */) {
  throw new Error("syncFhirData: not implemented")
}

// ─── Suggested future API surface (route-layer TODO only) ────────────────────
//
// These endpoints are NOT registered in `app.js` yet — they are listed here
// so the backend layout is explicit about what the EHR integration will
// expose when it lands. Each route should sit behind `requireCognitoUser`
// AND a per-recipient RBAC check; tokens must stay server-side.
//
//   POST /integrations/epic/connect
//     → startMyChartConnect(pool, req.user.id, body.careRecipientId, body.opts)
//
//   GET  /integrations/epic/callback
//     → handleOAuthCallback(pool, req.query)
//
//   POST /integrations/epic/sync
//     → syncFhirData(pool, body.connectionId)
//
// TODO(cognito): all three must run behind the same auth middleware
// the profile endpoint uses. TODO(rbac): all three must verify the
// caller is on the care team for `careRecipientId` before proceeding.
