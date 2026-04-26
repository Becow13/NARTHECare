import test from "node:test"
import assert from "node:assert/strict"
import {
  extractBearerToken,
  buildCognitoIssuer,
  extractIdentity,
} from "../cognito-auth.js"

// ---------------------------------------------------------------------------
// extractBearerToken
// ---------------------------------------------------------------------------

test("extractBearerToken returns the raw JWT from a well-formed header", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi")
})

test("extractBearerToken accepts any case for the scheme", () => {
  assert.equal(extractBearerToken("bearer abc.def.ghi"), "abc.def.ghi")
  assert.equal(extractBearerToken("BEARER abc.def.ghi"), "abc.def.ghi")
})

test("extractBearerToken allows multiple spaces between scheme and token", () => {
  assert.equal(extractBearerToken("Bearer   abc.def.ghi"), "abc.def.ghi")
})

test("extractBearerToken returns null when the header is missing", () => {
  assert.equal(extractBearerToken(undefined), null)
  assert.equal(extractBearerToken(null), null)
})

test("extractBearerToken returns null for non-string input", () => {
  assert.equal(extractBearerToken(123), null)
  assert.equal(extractBearerToken({}), null)
})

test("extractBearerToken returns null when scheme is not Bearer", () => {
  assert.equal(extractBearerToken("Basic abc.def"), null)
})

test("extractBearerToken returns null when the token portion is empty", () => {
  assert.equal(extractBearerToken("Bearer "), null)
  assert.equal(extractBearerToken("Bearer    "), null)
})

// ---------------------------------------------------------------------------
// buildCognitoIssuer
// ---------------------------------------------------------------------------

test("buildCognitoIssuer combines region and user pool into the canonical URL", () => {
  assert.equal(
    buildCognitoIssuer("us-east-1", "us-east-1_ABC123"),
    "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123",
  )
})

test("buildCognitoIssuer throws when region is missing", () => {
  assert.throws(() => buildCognitoIssuer("", "us-east-1_ABC"), /COGNITO_REGION/)
  assert.throws(() => buildCognitoIssuer(undefined, "us-east-1_ABC"), /COGNITO_REGION/)
})

test("buildCognitoIssuer throws when userPoolId is missing", () => {
  assert.throws(() => buildCognitoIssuer("us-east-1", ""), /COGNITO_USER_POOL_ID/)
  assert.throws(() => buildCognitoIssuer("us-east-1", undefined), /COGNITO_USER_POOL_ID/)
})

// ---------------------------------------------------------------------------
// extractIdentity
// ---------------------------------------------------------------------------

test("extractIdentity pulls sub, email, email_verified and display name from an ID token", () => {
  const id = extractIdentity({
    sub: "cog-sub-1",
    email: "user@example.com",
    email_verified: true,
    name: "Jane Doe",
  })
  assert.deepEqual(id, {
    cognitoSub: "cog-sub-1",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Jane Doe",
  })
})

test("extractIdentity coerces a string `email_verified` to a real boolean", () => {
  assert.equal(
    extractIdentity({ sub: "s", email: "e", email_verified: "true" }).emailVerified,
    true,
  )
  assert.equal(
    extractIdentity({ sub: "s", email: "e", email_verified: "false" }).emailVerified,
    false,
  )
})

test("extractIdentity falls back to given_name + family_name when name is absent", () => {
  const id = extractIdentity({
    sub: "cog-sub-1",
    given_name: "Jane",
    family_name: "Doe",
  })
  assert.equal(id.displayName, "Jane Doe")
})

test("extractIdentity falls back to cognito:username when name is absent", () => {
  const id = extractIdentity({
    sub: "cog-sub-1",
    email: "user@example.com",
    "cognito:username": "jdoe",
  })
  assert.equal(id.displayName, "jdoe")
})

test("extractIdentity returns null email + displayName + false emailVerified when only sub is present", () => {
  const id = extractIdentity({ sub: "cog-sub-1" })
  assert.equal(id.cognitoSub, "cog-sub-1")
  assert.equal(id.email, null)
  assert.equal(id.emailVerified, false)
  assert.equal(id.displayName, null)
})

test("extractIdentity throws when claims is not an object", () => {
  assert.throws(() => extractIdentity(null), /Invalid Cognito claims/)
  assert.throws(() => extractIdentity("not-an-object"), /Invalid Cognito claims/)
})

test("extractIdentity throws when sub is missing", () => {
  assert.throws(() => extractIdentity({}), /missing `sub`/)
  assert.throws(() => extractIdentity({ sub: "" }), /missing `sub`/)
})
