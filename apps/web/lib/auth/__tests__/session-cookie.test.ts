import { describe, expect, test } from "vitest"
import {
  buildSessionOptions,
  hasSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SECRET_MIN_LENGTH,
  SESSION_TTL_SECONDS,
} from "../session-cookie"

const VALID_PASSWORD = "x".repeat(SESSION_COOKIE_SECRET_MIN_LENGTH)

describe("buildSessionOptions", () => {
  test("returns iron-session config bound to the right cookie name + ttl", () => {
    const options = buildSessionOptions({
      password: VALID_PASSWORD,
      nodeEnv: "production",
    })
    expect(options.cookieName).toBe(SESSION_COOKIE_NAME)
    expect(options.password).toBe(VALID_PASSWORD)
    expect(options.ttl).toBe(SESSION_TTL_SECONDS)
    expect(options.cookieOptions?.httpOnly).toBe(true)
    expect(options.cookieOptions?.sameSite).toBe("lax")
    expect(options.cookieOptions?.path).toBe("/")
    expect(options.cookieOptions?.maxAge).toBe(SESSION_TTL_SECONDS)
  })

  test("secure flag is true only in production", () => {
    expect(
      buildSessionOptions({ password: VALID_PASSWORD, nodeEnv: "production" })
        .cookieOptions?.secure,
    ).toBe(true)
    expect(
      buildSessionOptions({ password: VALID_PASSWORD, nodeEnv: "development" })
        .cookieOptions?.secure,
    ).toBe(false)
    expect(
      buildSessionOptions({ password: VALID_PASSWORD, nodeEnv: undefined })
        .cookieOptions?.secure,
    ).toBe(false)
  })

  test("throws on a missing or too-short password", () => {
    expect(() =>
      buildSessionOptions({ password: undefined, nodeEnv: "development" }),
    ).toThrow(/SESSION_COOKIE_SECRET/)
    expect(() =>
      buildSessionOptions({ password: "short", nodeEnv: "development" }),
    ).toThrow(/SESSION_COOKIE_SECRET/)
  })
})

describe("hasSessionUser", () => {
  test("true when user.cognitoSub is present", () => {
    expect(
      hasSessionUser({
        user: {
          cognitoSub: "abc",
          email: null,
          emailVerified: false,
          displayName: null,
        },
      }),
    ).toBe(true)
  })

  test("false for empty / unauthenticated payloads", () => {
    expect(hasSessionUser({})).toBe(false)
    expect(hasSessionUser({ __keep__: true })).toBe(false)
    expect(
      hasSessionUser({
        user: {
          cognitoSub: "",
          email: null,
          emailVerified: false,
          displayName: null,
        },
      }),
    ).toBe(false)
  })
})
