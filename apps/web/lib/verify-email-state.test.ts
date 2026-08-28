import { describe, expect, it } from "vitest"

import {
  parseVerifyEmailState,
  VERIFIED_PARAM,
  VERIFY_EMAIL_CALLBACK_URL,
} from "./verify-email-state"

describe("parseVerifyEmailState", () => {
  it("runs the ceremony itself when handed a token", () => {
    expect(parseVerifyEmailState("?token=jwt.token.value")).toEqual({
      status: "pending",
      token: "jwt.token.value",
    })
  })

  it("recognizes its own callback URL as a completed verification", () => {
    // The whole reason VERIFY_EMAIL_CALLBACK_URL carries a marker: without it
    // a successful redirect is a bare /verify-email, which is also what a
    // bookmark looks like.
    const callback = new URL(VERIFY_EMAIL_CALLBACK_URL, "http://localhost:3000")
    expect(parseVerifyEmailState(callback.search)).toEqual({ status: "verified" })
  })

  it("reports the failure Better Auth appends to that callback URL", () => {
    const failed = new URL(VERIFY_EMAIL_CALLBACK_URL, "http://localhost:3000")
    failed.searchParams.set("error", "TOKEN_EXPIRED")

    // Both params are present — success marker and error together — and the
    // page must not congratulate someone whose link just expired.
    expect(failed.searchParams.get(VERIFIED_PARAM)).toBe("1")
    expect(parseVerifyEmailState(failed.search)).toEqual({
      status: "invalid",
      code: "TOKEN_EXPIRED",
    })
  })

  it("prefers an error over a token still in the URL", () => {
    expect(parseVerifyEmailState("?token=jwt.token.value&error=INVALID_TOKEN")).toEqual({
      status: "invalid",
      code: "INVALID_TOKEN",
    })
  })

  it("falls back to the idle state for a visit with nothing to act on", () => {
    expect(parseVerifyEmailState("")).toEqual({ status: "idle" })
    expect(parseVerifyEmailState("?token=")).toEqual({ status: "idle" })
  })
})
