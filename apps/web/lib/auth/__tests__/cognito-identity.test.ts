import { describe, expect, test } from "vitest"
import { extractCognitoIdentity } from "../cognito-identity"

describe("extractCognitoIdentity", () => {
  test("returns the canonical identity for a typical ID token", () => {
    const identity = extractCognitoIdentity({
      sub: "9f0a-uuid",
      email: "becca@narthecare.test",
      email_verified: true,
      name: "Becca Yang",
      "cognito:username": "becca",
    })
    expect(identity).toEqual({
      cognitoSub: "9f0a-uuid",
      email: "becca@narthecare.test",
      emailVerified: true,
      displayName: "Becca Yang",
    })
  })

  test("falls back to given_name + family_name when name is missing", () => {
    const identity = extractCognitoIdentity({
      sub: "x",
      given_name: "Becca",
      family_name: "Yang",
    })
    expect(identity.displayName).toBe("Becca Yang")
  })

  test("falls back to cognito:username when no name claims exist", () => {
    const identity = extractCognitoIdentity({
      sub: "x",
      "cognito:username": "becca",
    })
    expect(identity.displayName).toBe("becca")
  })

  test("returns null displayName when nothing usable is present", () => {
    expect(extractCognitoIdentity({ sub: "x" }).displayName).toBeNull()
  })

  test("coerces string 'true' / 'false' for email_verified", () => {
    expect(
      extractCognitoIdentity({ sub: "x", email_verified: "true" }).emailVerified,
    ).toBe(true)
    expect(
      extractCognitoIdentity({ sub: "x", email_verified: "false" }).emailVerified,
    ).toBe(false)
  })

  test("defaults emailVerified to false when claim is missing", () => {
    expect(extractCognitoIdentity({ sub: "x" }).emailVerified).toBe(false)
  })

  test("returns null email when the claim is missing or non-string", () => {
    expect(extractCognitoIdentity({ sub: "x" }).email).toBeNull()
    expect(extractCognitoIdentity({ sub: "x", email: 42 }).email).toBeNull()
  })

  test.each([null, undefined, 42, "not-an-object"])(
    "throws on non-object claims (%j)",
    (input) => {
      expect(() =>
        extractCognitoIdentity(input as unknown as Record<string, unknown>),
      ).toThrow(/Invalid Cognito claims/)
    },
  )

  test("throws when sub is missing or empty", () => {
    expect(() => extractCognitoIdentity({})).toThrow(/sub/)
    expect(() => extractCognitoIdentity({ sub: "" })).toThrow(/sub/)
  })
})
