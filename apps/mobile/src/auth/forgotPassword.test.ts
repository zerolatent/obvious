import { describe, expect, it, vi } from "vitest"

import { AUTH_BASE_URL } from "./config"
import { forgotPasswordURL, openForgotPassword, type ForgotPasswordPorts } from "./forgotPassword"

/**
 * The browser hop is the OS's job; what is asserted here is the part we own —
 * that the URL handed to the OS points at the web app's forgot-password page
 * on the configured auth server, and that a refused hop surfaces as an error
 * the sign-in screen can show without losing the form.
 */

function ports(openURL: ForgotPasswordPorts["openURL"]): ForgotPasswordPorts {
  return { openURL, authBaseURL: AUTH_BASE_URL }
}

describe("forgotPasswordURL", () => {
  it("points at the web app's forgot-password page on the auth server", () => {
    expect(forgotPasswordURL("https://auth.example.com")).toBe(
      "https://auth.example.com/forgot-password",
    )
  })
})

describe("openForgotPassword", () => {
  it("opens the reset page in the system browser", async () => {
    const openURL = vi.fn(async () => undefined)

    const outcome = await openForgotPassword(ports(openURL))

    expect(outcome).toEqual({ status: "opened" })
    expect(openURL).toHaveBeenCalledWith(`${AUTH_BASE_URL}/forgot-password`)
  })

  it("reports a refused hop as an error that names the page", async () => {
    const outcome = await openForgotPassword(
      ports(async () => {
        throw new Error("no activity found")
      }),
    )

    expect(outcome).toEqual({
      status: "error",
      message: "Couldn't open the reset page: no activity found",
    })
  })

  it("survives a non-Error rejection", async () => {
    const outcome = await openForgotPassword(
      ports(async () => {
        throw "string rejection"
      }),
    )

    expect(outcome).toEqual({
      status: "error",
      message: "Couldn't open the reset page: string rejection",
    })
  })
})
