import { describe, expect, it, vi } from "vitest"

import {
  MIN_PASSWORD_LENGTH,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  validateEmail,
  validatePassword,
  type AuthActionResult,
  type EmailPasswordActions,
} from "./emailPassword"

function actions(overrides: Partial<EmailPasswordActions> = {}): EmailPasswordActions {
  const ok = async (): Promise<AuthActionResult> => ({})
  return { signUp: vi.fn(ok), signIn: vi.fn(ok), signOut: vi.fn(ok), ...overrides }
}

const VALID = { email: "ada@example.com", password: "correct-horse" }

describe("input validation", () => {
  it("rejects an empty or malformed address before spending a round trip", () => {
    expect(validateEmail("")).toBe("Enter your email address.")
    expect(validateEmail("ada@")).toBe("Enter a valid email address.")
    expect(validateEmail(" ada@example.com ")).toBeNull()
  })

  it("states the minimum length the server enforces", () => {
    expect(validatePassword("")).toBe("Enter your password.")
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain(
      `${MIN_PASSWORD_LENGTH} characters`,
    )
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })
})

describe("signUpWithEmail", () => {
  it("submits a trimmed address and reports success", async () => {
    const signUp = vi.fn(async () => ({}))
    const result = await signUpWithEmail(actions({ signUp }), {
      ...VALID,
      email: "  ada@example.com  ",
      name: "Ada",
    })

    expect(result).toEqual({ status: "success" })
    expect(signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: VALID.password,
      name: "Ada",
    })
  })

  it("does not call the server when the input cannot possibly be valid", async () => {
    const signUp = vi.fn(async () => ({}))
    const result = await signUpWithEmail(actions({ signUp }), {
      email: "nope",
      password: VALID.password,
      name: "Ada",
    })

    expect(result).toEqual({ status: "error", message: "Enter a valid email address." })
    expect(signUp).not.toHaveBeenCalled()
  })

  it("surfaces the server's reason on the surface that creates accounts", async () => {
    const result = await signUpWithEmail(
      actions({ signUp: async () => ({ error: { message: "Email already registered" } }) }),
      { ...VALID, name: "Ada" },
    )

    expect(result).toEqual({ status: "error", message: "Email already registered" })
  })

  it("explains a disabled method rather than blaming the credentials", async () => {
    const result = await signUpWithEmail(
      actions({
        signUp: async () => ({
          error: { code: "EMAIL_PASSWORD_DISABLED", message: "not found" },
        }),
      }),
      { ...VALID, name: "Ada" },
    )

    expect(result).toEqual({
      status: "error",
      message: "Email and password sign-in is not enabled for this deployment.",
    })
  })
})

describe("signInWithEmail", () => {
  it("reports success when the server accepts the credentials", async () => {
    const signIn = vi.fn(async () => ({}))
    expect(await signInWithEmail(actions({ signIn }), VALID)).toEqual({ status: "success" })
    expect(signIn).toHaveBeenCalledWith(VALID)
  })

  it("gives one message for a wrong password and an unknown account alike", async () => {
    const unknownAccount = await signInWithEmail(
      actions({
        signIn: async () => ({ error: { message: "User not found", code: "USER_NOT_FOUND" } }),
      }),
      VALID,
    )
    const wrongPassword = await signInWithEmail(
      actions({ signIn: async () => ({ error: { message: "Invalid password" } }) }),
      VALID,
    )

    // Distinct messages would turn the login form into an account-enumeration
    // oracle.
    expect(unknownAccount).toEqual({ status: "error", message: "Email or password is incorrect." })
    expect(wrongPassword).toEqual(unknownAccount)
  })

  it("says the server is unreachable instead of blaming the password", async () => {
    const result = await signInWithEmail(
      actions({
        signIn: async () => {
          throw new Error("Network request failed")
        },
      }),
      VALID,
    )

    expect(result).toEqual({
      status: "error",
      message: "Could not reach the auth server. Check your connection and try again.",
    })
  })
})

describe("signOut", () => {
  it("reports success when the session is cleared", async () => {
    expect(await signOut(actions())).toEqual({ status: "success" })
  })

  it("does not pretend to have signed out when the call fails", async () => {
    const result = await signOut(
      actions({ signOut: async () => ({ error: { message: "Session revoke failed" } }) }),
    )

    expect(result).toEqual({ status: "error", message: "Session revoke failed" })
  })
})
