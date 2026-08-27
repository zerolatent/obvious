import { describe, expect, it } from "vitest"

import { parseOAuthCallbackState } from "./oauth-callback-state"

describe("parseOAuthCallbackState", () => {
  it("reports no callback state when there is no error param", () => {
    expect(parseOAuthCallbackState("")).toEqual({ status: "none" })
    expect(parseOAuthCallbackState("?foo=bar")).toEqual({ status: "none" })
  })

  it("treats access_denied as a user cancellation", () => {
    expect(parseOAuthCallbackState("?error=access_denied")).toEqual({ status: "cancelled" })
  })

  it("treats any other error code as a provider error, preserving the code", () => {
    expect(parseOAuthCallbackState("?error=server_error")).toEqual({
      status: "error",
      code: "server_error",
    })
    expect(parseOAuthCallbackState("?error=unable_to_get_user_info")).toEqual({
      status: "error",
      code: "unable_to_get_user_info",
    })
  })

  it("ignores unrelated params alongside the error code", () => {
    expect(parseOAuthCallbackState("?error=access_denied&error_description=denied")).toEqual({
      status: "cancelled",
    })
  })
})
