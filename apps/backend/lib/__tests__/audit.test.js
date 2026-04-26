import test from "node:test"
import assert from "node:assert/strict"
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  extractRequestContext,
} from "../audit.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("AUDIT_ACTIONS exposes the canonical action strings", () => {
  assert.equal(AUDIT_ACTIONS.authenticateUser, "AUTHENTICATE_USER")
  assert.equal(AUDIT_ACTIONS.mergeCognitoIdentity, "AUTH_MERGE_COGNITO_IDENTITY")
  assert.equal(AUDIT_ACTIONS.createCareRecipient, "CREATE_CARE_RECIPIENT")
  assert.equal(AUDIT_ACTIONS.viewCareRecipient, "VIEW_CARE_RECIPIENT")
  assert.equal(AUDIT_ACTIONS.listCareRecipients, "LIST_CARE_RECIPIENTS")
})

test("AUDIT_ACTIONS is frozen so callers cannot mutate it", () => {
  assert.ok(Object.isFrozen(AUDIT_ACTIONS))
})

test("AUDIT_RESOURCE_TYPES is frozen", () => {
  assert.ok(Object.isFrozen(AUDIT_RESOURCE_TYPES))
  assert.equal(AUDIT_RESOURCE_TYPES.user, "user")
  assert.equal(AUDIT_RESOURCE_TYPES.careRecipient, "care_recipient")
})

// ---------------------------------------------------------------------------
// extractRequestContext
// ---------------------------------------------------------------------------

test("extractRequestContext uses the first hop of X-Forwarded-For when present", () => {
  const ctx = extractRequestContext({
    headers: {
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "user-agent": "NARTHECare/1.0 iOS/17",
    },
    ip: "10.0.0.1",
  })
  assert.equal(ctx.ipAddress, "203.0.113.7")
  assert.equal(ctx.userAgent, "NARTHECare/1.0 iOS/17")
})

test("extractRequestContext falls back to req.ip when no forwarded header is set", () => {
  const ctx = extractRequestContext({
    headers: { "user-agent": "curl/8" },
    ip: "127.0.0.1",
  })
  assert.equal(ctx.ipAddress, "127.0.0.1")
  assert.equal(ctx.userAgent, "curl/8")
})

test("extractRequestContext returns nulls when no headers or ip are present", () => {
  const ctx = extractRequestContext({ headers: {} })
  assert.equal(ctx.ipAddress, null)
  assert.equal(ctx.userAgent, null)
})

test("extractRequestContext normalizes empty strings to null", () => {
  const ctx = extractRequestContext({
    headers: { "x-forwarded-for": "", "user-agent": "   " },
    ip: "",
  })
  assert.equal(ctx.ipAddress, null)
  assert.equal(ctx.userAgent, null)
})

test("extractRequestContext tolerates a missing headers object", () => {
  const ctx = extractRequestContext({})
  assert.equal(ctx.ipAddress, null)
  assert.equal(ctx.userAgent, null)
})
