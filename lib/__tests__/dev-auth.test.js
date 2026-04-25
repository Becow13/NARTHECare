import test from "node:test"
import assert from "node:assert/strict"
import { DEV_MOCK_USER, isDevAuthBypassEnabled } from "../dev-auth.js"

// ---------------------------------------------------------------------------
// DEV_MOCK_USER
// ---------------------------------------------------------------------------

test("DEV_MOCK_USER carries the canonical dev identity", () => {
  assert.equal(DEV_MOCK_USER.cognitoSub, "dev-bypass")
  assert.equal(DEV_MOCK_USER.email, "dev@narthecare.local")
  assert.equal(DEV_MOCK_USER.name, "Dev User")
  assert.equal(DEV_MOCK_USER.role, "caregiver")
})

test("DEV_MOCK_USER is frozen so callers cannot mutate the sentinel", () => {
  assert.throws(() => {
    DEV_MOCK_USER.role = "admin"
  }, /read[- ]only|Cannot assign/i)
})

// ---------------------------------------------------------------------------
// isDevAuthBypassEnabled
// ---------------------------------------------------------------------------

test("isDevAuthBypassEnabled returns true when flag=true and NODE_ENV is not production", () => {
  assert.equal(isDevAuthBypassEnabled({ flag: "true", nodeEnv: "development" }), true)
  assert.equal(isDevAuthBypassEnabled({ flag: "true", nodeEnv: "test" }), true)
  assert.equal(isDevAuthBypassEnabled({ flag: "true", nodeEnv: undefined }), true)
})

test("isDevAuthBypassEnabled accepts any case for the flag", () => {
  assert.equal(isDevAuthBypassEnabled({ flag: "TRUE", nodeEnv: "development" }), true)
  assert.equal(isDevAuthBypassEnabled({ flag: "True", nodeEnv: "development" }), true)
})

test("isDevAuthBypassEnabled is false in production even when flag=true", () => {
  assert.equal(isDevAuthBypassEnabled({ flag: "true", nodeEnv: "production" }), false)
  assert.equal(isDevAuthBypassEnabled({ flag: "TRUE", nodeEnv: "production" }), false)
})

test("isDevAuthBypassEnabled is false when flag is absent or falsy", () => {
  assert.equal(isDevAuthBypassEnabled({ flag: undefined, nodeEnv: "development" }), false)
  assert.equal(isDevAuthBypassEnabled({ flag: "", nodeEnv: "development" }), false)
  assert.equal(isDevAuthBypassEnabled({ flag: "false", nodeEnv: "development" }), false)
  assert.equal(isDevAuthBypassEnabled({ flag: "0", nodeEnv: "development" }), false)
  assert.equal(isDevAuthBypassEnabled({ flag: "yes", nodeEnv: "development" }), false)
})

test("isDevAuthBypassEnabled is safe to call with no arguments", () => {
  assert.equal(isDevAuthBypassEnabled(), false)
})
