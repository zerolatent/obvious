import { describe, expect, it } from "vitest"

import {
  MISSING_TOKEN_CODE,
  parseResetPasswordState,
  RESET_PASSWORD_PATH,
} from "./reset-password-state"

describe("parseResetPasswordState", () => {
  it("reads the token Better Auth appends to the redirect", () => {
    expect(parseResetPasswordState("?token=abc123")).toEqual({ status: "ready", token: "abc123" })
  })

  it("reports the server's error code when the link was already rejected", () => {
    expect(parseResetPasswordState("?error=INVALID_TOKEN")).toEqual({
      status: "invalid",
      code: "INVALID_TOKEN",
    })
  })

  it("prefers the error over a token that arrived alongside it", () => {
    // A form rendered from the stale token could only ever be rejected, so the
    // error has to win no matter which order the params appear in.
    expect(parseResetPasswordState("?token=abc123&error=INVALID_TOKEN")).toEqual({
      status: "invalid",
      code: "INVALID_TOKEN",
    })
    expect(parseResetPasswordState("?error=INVALID_TOKEN&token=abc123")).toEqual({
      status: "invalid",
      code: "INVALID_TOKEN",
    })
  })

  it("treats a direct visit as an unusable link rather than an empty form", () => {
    expect(parseResetPasswordState("")).toEqual({ status: "invalid", code: MISSING_TOKEN_CODE })
  })

  it("treats an empty token as no token", () => {
    expect(parseResetPasswordState("?token=")).toEqual({
      status: "invalid",
      code: MISSING_TOKEN_CODE,
    })
  })

  it("round-trips the path the reset request asks Better Auth to redirect to", () => {
    // The mailed link comes back to RESET_PASSWORD_PATH with `?token=…`
    // appended; parsing that exact shape is what ties the two constants
    // together.
    const landing = new URL(`${RESET_PASSWORD_PATH}?token=abc123`, "http://localhost:3000")
    expect(landing.pathname).toBe(RESET_PASSWORD_PATH)
    expect(parseResetPasswordState(landing.search)).toEqual({ status: "ready", token: "abc123" })
  })
})
