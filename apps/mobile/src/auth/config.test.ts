import { describe, expect, it } from "vitest"

import appJson from "../../app.json"
import { APP_SCHEME, DEFAULT_AUTH_BASE_URL, resolveAuthBaseURL } from "./config"
import { deepLinkCallbackURL } from "./socialSignIn"

describe("APP_SCHEME", () => {
  it("is the scheme the OS actually registers for this app", () => {
    // If these ever diverge, OAuth opens fine and simply never comes back.
    expect(APP_SCHEME).toBe(appJson.expo.scheme)
    expect(deepLinkCallbackURL(APP_SCHEME)).toBe(`${appJson.expo.scheme}://`)
  })
})

describe("resolveAuthBaseURL", () => {
  it("falls back to the origin the auth server itself defaults to", () => {
    expect(resolveAuthBaseURL({})).toBe(DEFAULT_AUTH_BASE_URL)
    expect(resolveAuthBaseURL({ EXPO_PUBLIC_AUTH_BASE_URL: "  " })).toBe(DEFAULT_AUTH_BASE_URL)
  })

  it("uses the configured origin, without a trailing slash to double up on paths", () => {
    expect(resolveAuthBaseURL({ EXPO_PUBLIC_AUTH_BASE_URL: "https://auth.example.com/" })).toBe(
      "https://auth.example.com",
    )
  })

  it("throws on a malformed value instead of failing every request later", () => {
    expect(() => resolveAuthBaseURL({ EXPO_PUBLIC_AUTH_BASE_URL: "auth.example.com" })).toThrow(
      /not a valid URL/,
    )
  })

  it("refuses a non-http scheme — the auth server is not reachable over one", () => {
    expect(() => resolveAuthBaseURL({ EXPO_PUBLIC_AUTH_BASE_URL: "obvious-auth://x" })).toThrow(
      /must be an http\(s\) URL/,
    )
  })
})
