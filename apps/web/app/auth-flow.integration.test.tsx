import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createTestAuthFetch } from "../test/create-test-auth-fetch"
import HomePage from "./page"
import LoginPage from "./login/page"
import SignupPage from "./signup/page"

const EMAIL = "reader@example.com"
const PASSWORD = "correct-horse-battery-staple"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("email/password signup -> login -> logout", () => {
  it("round-trips through the real Better Auth handler end to end", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", createTestAuthFetch("email-password").fetch)

    // Sign up. Better Auth auto-establishes a session on a successful signup.
    const signup = render(<SignupPage />)
    await user.type(await screen.findByLabelText(/^name$/i), "Reader")
    await user.type(screen.getByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /sign up/i }))
    expect(await screen.findByText(/account created/i)).toBeInTheDocument()
    signup.unmount()

    // The signup session is already live: log it out before testing login.
    const homeAfterSignup = render(<HomePage />)
    expect(await screen.findByText(new RegExp(`signed in as ${EMAIL}`, "i"))).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /log out/i }))
    expect(await screen.findByRole("link", { name: /log in/i })).toBeInTheDocument()
    homeAfterSignup.unmount()

    // Log back in with the account just created.
    const login = render(<LoginPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /log in/i }))
    expect(await screen.findByText(/^logged in\.$/i)).toBeInTheDocument()
    login.unmount()

    // The session now resolves on any page that reads it.
    const homeAfterLogin = render(<HomePage />)
    expect(await screen.findByText(new RegExp(`signed in as ${EMAIL}`, "i"))).toBeInTheDocument()

    // Log out again, and the session disappears everywhere.
    await user.click(screen.getByRole("button", { name: /log out/i }))
    expect(await screen.findByRole("link", { name: /log in/i })).toBeInTheDocument()
    homeAfterLogin.unmount()
  })
})

describe("wrong password", () => {
  it("shows the same generic error as an unknown account (no account enumeration)", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)

    // Seed a real account directly through the handler (bypassing the UI).
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Reader" }),
      }),
    )

    const wrongPassword = render(<LoginPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), "definitely-the-wrong-password")
    await user.click(screen.getByRole("button", { name: /log in/i }))
    const wrongPasswordError = await screen.findByRole("alert")
    const wrongPasswordText = wrongPasswordError.textContent
    expect(wrongPasswordText).toBe("Incorrect email or password.")
    wrongPassword.unmount()

    const unknownAccount = render(<LoginPage />)
    await user.type(await screen.findByLabelText(/^email$/i), "nobody@example.com")
    await user.type(screen.getByLabelText(/^password$/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /log in/i }))
    const unknownAccountError = await screen.findByRole("alert")
    expect(unknownAccountError.textContent).toBe(wrongPasswordText)
    unknownAccount.unmount()
  })
})
