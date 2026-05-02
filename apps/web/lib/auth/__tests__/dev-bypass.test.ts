import { describe, expect, test } from "vitest"
import {
  DEV_MOCK_USER,
  assertDevAuthBypassAllowed,
  isDevAuthBypassEnabled,
} from "../dev-bypass"

describe("DEV_MOCK_USER", () => {
  test("matches the backend dev sentinel exactly", () => {
    expect(DEV_MOCK_USER.cognitoSub).toBe("dev-bypass")
    expect(DEV_MOCK_USER.email).toBe("dev@narthecare.local")
    expect(DEV_MOCK_USER.emailVerified).toBe(true)
    expect(DEV_MOCK_USER.displayName).toBe("Dev Caregiver")
  })

  test("is frozen", () => {
    expect(() => {
      ;(DEV_MOCK_USER as { displayName: string }).displayName = "Other"
    }).toThrow()
  })
})

describe("isDevAuthBypassEnabled", () => {
  test("true only when flag is 'true' AND nodeEnv is not production", () => {
    expect(isDevAuthBypassEnabled({ flag: "true", nodeEnv: "development" })).toBe(true)
    expect(isDevAuthBypassEnabled({ flag: "TRUE", nodeEnv: "test" })).toBe(true)
    expect(isDevAuthBypassEnabled({ flag: "true", nodeEnv: "production" })).toBe(false)
    expect(isDevAuthBypassEnabled({ flag: "false", nodeEnv: "development" })).toBe(false)
    expect(isDevAuthBypassEnabled({ flag: undefined, nodeEnv: "development" })).toBe(false)
    expect(isDevAuthBypassEnabled({ flag: "yes", nodeEnv: "development" })).toBe(false)
  })
})

describe("assertDevAuthBypassAllowed", () => {
  test("throws only when production AND flag explicitly true", () => {
    expect(() =>
      assertDevAuthBypassAllowed({ flag: "true", nodeEnv: "production" }),
    ).toThrow(/DEV_AUTH_BYPASS=true is not allowed/)
  })

  test("does not throw when nodeEnv is not production", () => {
    expect(() =>
      assertDevAuthBypassAllowed({ flag: "true", nodeEnv: "development" }),
    ).not.toThrow()
  })

  test("does not throw when flag is not 'true'", () => {
    expect(() =>
      assertDevAuthBypassAllowed({ flag: "false", nodeEnv: "production" }),
    ).not.toThrow()
    expect(() =>
      assertDevAuthBypassAllowed({ flag: undefined, nodeEnv: "production" }),
    ).not.toThrow()
  })
})
