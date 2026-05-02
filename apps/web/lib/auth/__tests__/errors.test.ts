import { describe, expect, test } from "vitest"
import {
  AUTH_ERROR_CODES,
  authErrorMessage,
  isKnownAuthErrorCode,
} from "../errors"

describe("AUTH_ERROR_CODES", () => {
  test("every code is a non-empty string", () => {
    for (const code of Object.values(AUTH_ERROR_CODES)) {
      expect(typeof code).toBe("string")
      expect(code.length).toBeGreaterThan(0)
    }
  })

  test("codes are unique", () => {
    const values = Object.values(AUTH_ERROR_CODES)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe("authErrorMessage", () => {
  test("returns a stable, generic copy for each known code", () => {
    for (const code of Object.values(AUTH_ERROR_CODES)) {
      const message = authErrorMessage(code)
      expect(message).toMatch(/sign[- ]?in/i)
      expect(message).not.toMatch(/cognito/i)
      expect(message).not.toMatch(/token/i)
      expect(message).not.toMatch(/jwt/i)
    }
  })

  test("falls through to generic message for unknown / tampered codes", () => {
    const message = authErrorMessage("not_a_real_code")
    expect(message).toMatch(/something went wrong/i)
  })

  test("falls through for null / undefined", () => {
    expect(authErrorMessage(null)).toMatch(/something went wrong/i)
    expect(authErrorMessage(undefined)).toMatch(/something went wrong/i)
  })
})

describe("isKnownAuthErrorCode", () => {
  test("true for every defined code", () => {
    for (const code of Object.values(AUTH_ERROR_CODES)) {
      expect(isKnownAuthErrorCode(code)).toBe(true)
    }
  })

  test("false for unknown strings, non-strings, null, undefined", () => {
    expect(isKnownAuthErrorCode("nope")).toBe(false)
    expect(isKnownAuthErrorCode(123)).toBe(false)
    expect(isKnownAuthErrorCode(null)).toBe(false)
    expect(isKnownAuthErrorCode(undefined)).toBe(false)
    expect(isKnownAuthErrorCode({})).toBe(false)
  })
})
