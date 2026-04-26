import test from "node:test"
import assert from "node:assert/strict"
import {
  DEV_MOCK_USER,
  assertDevAuthBypassAllowed,
  assertProductionAuthReady,
  isDevAuthBypassEnabled,
} from "../dev-auth.js"

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

// ---------------------------------------------------------------------------
// assertDevAuthBypassAllowed — production fail-closed guard
// ---------------------------------------------------------------------------

test("assertDevAuthBypassAllowed throws when NODE_ENV=production and flag=true", () => {
  assert.throws(
    () => assertDevAuthBypassAllowed({ flag: "true", nodeEnv: "production" }),
    /DEV_AUTH_BYPASS=true is not allowed/,
  )
  assert.throws(
    () => assertDevAuthBypassAllowed({ flag: "TRUE", nodeEnv: "production" }),
    /DEV_AUTH_BYPASS=true is not allowed/,
  )
})

test("assertDevAuthBypassAllowed is a no-op outside of production", () => {
  assert.doesNotThrow(() =>
    assertDevAuthBypassAllowed({ flag: "true", nodeEnv: "development" }),
  )
  assert.doesNotThrow(() =>
    assertDevAuthBypassAllowed({ flag: "true", nodeEnv: "test" }),
  )
  assert.doesNotThrow(() =>
    assertDevAuthBypassAllowed({ flag: "true", nodeEnv: undefined }),
  )
})

test("assertDevAuthBypassAllowed is a no-op in production when the flag is falsy", () => {
  assert.doesNotThrow(() =>
    assertDevAuthBypassAllowed({ flag: "false", nodeEnv: "production" }),
  )
  assert.doesNotThrow(() =>
    assertDevAuthBypassAllowed({ flag: undefined, nodeEnv: "production" }),
  )
})

// ---------------------------------------------------------------------------
// assertProductionAuthReady — fail closed on missing Cognito config
// ---------------------------------------------------------------------------

test("assertProductionAuthReady throws in production when any COGNITO_* var is missing", () => {
  assert.throws(
    () =>
      assertProductionAuthReady({
        nodeEnv: "production",
        devBypassFlag: "false",
        region: "",
        userPoolId: "pool",
        clientId: "client",
      }),
    /COGNITO_REGION/,
  )
  assert.throws(
    () =>
      assertProductionAuthReady({
        nodeEnv: "production",
        devBypassFlag: "false",
        region: "us-east-1",
        userPoolId: undefined,
        clientId: "client",
      }),
    /COGNITO_USER_POOL_ID/,
  )
  assert.throws(
    () =>
      assertProductionAuthReady({
        nodeEnv: "production",
        devBypassFlag: "false",
        region: "us-east-1",
        userPoolId: "pool",
        clientId: "",
      }),
    /COGNITO_CLIENT_ID/,
  )
})

test("assertProductionAuthReady passes in production when every COGNITO_* is present", () => {
  assert.doesNotThrow(() =>
    assertProductionAuthReady({
      nodeEnv: "production",
      devBypassFlag: "false",
      region: "us-east-1",
      userPoolId: "pool",
      clientId: "client",
    }),
  )
})

test("assertProductionAuthReady is a no-op outside of production", () => {
  assert.doesNotThrow(() =>
    assertProductionAuthReady({
      nodeEnv: "development",
      devBypassFlag: "false",
      region: undefined,
      userPoolId: undefined,
      clientId: undefined,
    }),
  )
})
