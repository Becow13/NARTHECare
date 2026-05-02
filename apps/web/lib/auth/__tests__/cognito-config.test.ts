import { describe, expect, test } from "vitest"
import {
  buildAuthorizeUrl,
  buildCognitoIssuer,
  buildLogoutUrl,
  buildPostLogoutRedirectUri,
  buildRedirectUri,
  buildTokenEndpoint,
  loadCognitoConfig,
} from "../cognito-config"

const VALID_ENV = {
  COGNITO_REGION: "us-west-2",
  COGNITO_USER_POOL_ID: "us-west-2_AbCdE1234",
  COGNITO_CLIENT_ID: "1example23456789",
  COGNITO_DOMAIN: "narthecare-dev.auth.us-west-2.amazoncognito.com",
  APP_BASE_URL: "https://app.narthecare.test",
} as const

describe("buildCognitoIssuer", () => {
  test("returns canonical issuer", () => {
    expect(buildCognitoIssuer("us-west-2", "us-west-2_AbCdE1234")).toBe(
      "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_AbCdE1234",
    )
  })

  test.each([
    ["", "us-west-2_AbCdE1234"],
    ["us-west-2", ""],
  ])("throws on missing input (region=%j, userPoolId=%j)", (region, pool) => {
    expect(() => buildCognitoIssuer(region, pool)).toThrow(/required/)
  })
})

describe("buildRedirectUri / buildPostLogoutRedirectUri", () => {
  test("trim trailing slash on app base URL", () => {
    expect(buildRedirectUri("https://app.test/")).toBe(
      "https://app.test/api/auth/callback",
    )
    expect(buildPostLogoutRedirectUri("https://app.test/")).toBe(
      "https://app.test/auth/sign-in",
    )
  })

  test("preserves the URL when no trailing slash", () => {
    expect(buildRedirectUri("https://app.test")).toBe(
      "https://app.test/api/auth/callback",
    )
  })
})

describe("loadCognitoConfig", () => {
  test("returns the resolved config when every field is present", () => {
    const config = loadCognitoConfig(VALID_ENV)
    expect(config.region).toBe("us-west-2")
    expect(config.userPoolId).toBe("us-west-2_AbCdE1234")
    expect(config.clientId).toBe("1example23456789")
    expect(config.clientSecret).toBeNull()
    expect(config.domain).toBe(
      "narthecare-dev.auth.us-west-2.amazoncognito.com",
    )
    expect(config.scopes).toBe("openid email profile")
    expect(config.appBaseUrl).toBe("https://app.narthecare.test")
    expect(config.issuer).toBe(
      "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_AbCdE1234",
    )
    expect(config.redirectUri).toBe(
      "https://app.narthecare.test/api/auth/callback",
    )
    expect(config.postLogoutRedirectUri).toBe(
      "https://app.narthecare.test/auth/sign-in",
    )
  })

  test("strips https:// prefix and trailing slashes from the domain", () => {
    const config = loadCognitoConfig({
      ...VALID_ENV,
      COGNITO_DOMAIN: "https://auth.narthecare.com/",
    })
    expect(config.domain).toBe("auth.narthecare.com")
  })

  test("treats an empty COGNITO_CLIENT_SECRET as absent", () => {
    const config = loadCognitoConfig({
      ...VALID_ENV,
      COGNITO_CLIENT_SECRET: "   ",
    })
    expect(config.clientSecret).toBeNull()
  })

  test("captures a non-empty COGNITO_CLIENT_SECRET", () => {
    const config = loadCognitoConfig({
      ...VALID_ENV,
      COGNITO_CLIENT_SECRET: "shhh",
    })
    expect(config.clientSecret).toBe("shhh")
  })

  test("uses the override scopes when provided", () => {
    const config = loadCognitoConfig({
      ...VALID_ENV,
      COGNITO_SCOPES: "openid",
    })
    expect(config.scopes).toBe("openid")
  })

  test("falls back to default scopes for blank override", () => {
    const config = loadCognitoConfig({
      ...VALID_ENV,
      COGNITO_SCOPES: "   ",
    })
    expect(config.scopes).toBe("openid email profile")
  })

  test("throws naming every missing variable", () => {
    expect(() =>
      loadCognitoConfig({
        COGNITO_REGION: "",
        COGNITO_USER_POOL_ID: "",
        COGNITO_CLIENT_ID: "",
        COGNITO_DOMAIN: "",
        APP_BASE_URL: "",
      }),
    ).toThrow(
      /COGNITO_REGION.*COGNITO_USER_POOL_ID.*COGNITO_CLIENT_ID.*COGNITO_DOMAIN.*APP_BASE_URL/,
    )
  })
})

describe("buildAuthorizeUrl", () => {
  const config = loadCognitoConfig(VALID_ENV)

  test("includes every OAuth parameter Cognito requires", () => {
    const url = new URL(buildAuthorizeUrl(config, { state: "abc.123" }))
    expect(url.host).toBe(config.domain)
    expect(url.pathname).toBe("/oauth2/authorize")
    expect(url.searchParams.get("client_id")).toBe(config.clientId)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe("openid email profile")
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    expect(url.searchParams.get("state")).toBe("abc.123")
  })

  test("URL-encodes the state value", () => {
    const url = new URL(buildAuthorizeUrl(config, { state: "foo bar/baz" }))
    expect(url.searchParams.get("state")).toBe("foo bar/baz")
    expect(url.toString()).toContain("state=foo+bar%2Fbaz")
  })
})

describe("buildTokenEndpoint", () => {
  test("returns the canonical Cognito token URL", () => {
    expect(buildTokenEndpoint(loadCognitoConfig(VALID_ENV))).toBe(
      "https://narthecare-dev.auth.us-west-2.amazoncognito.com/oauth2/token",
    )
  })
})

describe("buildLogoutUrl", () => {
  test("includes client_id and logout_uri", () => {
    const url = new URL(buildLogoutUrl(loadCognitoConfig(VALID_ENV)))
    expect(url.pathname).toBe("/logout")
    expect(url.searchParams.get("client_id")).toBe("1example23456789")
    expect(url.searchParams.get("logout_uri")).toBe(
      "https://app.narthecare.test/auth/sign-in",
    )
  })
})
