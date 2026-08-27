import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestAuthFetch } from "../test/create-test-auth-fetch"
import { VirtualAuthenticator } from "../test/webauthn-virtual-authenticator"
import AccountPage from "./account/page"
import LoginPage from "./login/page"
import HomePage from "./page"
import SignupPage from "./signup/page"

const EMAIL = "passkey-user@example.com"
const PASSWORD = "correct-horse-battery-staple"

// Better Auth's passkey plugin defaults `rpID` to the BETTER_AUTH_URL
// hostname, and reads `expectedOrigin` off the request's Origin header — the
// test fetch in create-test-auth-fetch.ts uses "http://localhost:3000" for
// both, so the authenticator must agree on the same pair to verify.
const RP_ID = "localhost"
const ORIGIN = "http://localhost:3000"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach(() => {
  // Real WebAuthn support: gates both `isPasskeySupported()` in the UI and
  // `@simplewebauthn/browser`'s own internal `browserSupportsWebAuthn()`
  // check before it ever touches `navigator.credentials`.
  vi.stubGlobal(
    "PublicKeyCredential",
    class PublicKeyCredential {},
  )
})

describe("passkey registration and login ceremonies", () => {
  it("registers a passkey from account settings, then logs back in with it", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", createTestAuthFetch("email-password,passkey").fetch)
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN)
    authenticator.install()

    // Sign up; Better Auth establishes a session immediately.
    const signup = render(<SignupPage />)
    await user.type(await screen.findByLabelText(/^name$/i), "Passkey User")
    await user.type(screen.getByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /sign up/i }))
    expect(await screen.findByText(/account created/i)).toBeInTheDocument()
    signup.unmount()

    // Add a passkey from account settings — the WebAuthn "registration" ceremony.
    const account = render(<AccountPage />)
    await user.click(await screen.findByRole("button", { name: /add a passkey/i }))
    expect(await screen.findByText(/passkey added\./i)).toBeInTheDocument()
    expect(authenticator.credentialCount).toBe(1)
    account.unmount()

    // Log out so the login page's passkey ceremony starts from a clean session.
    const home = render(<HomePage />)
    await user.click(await screen.findByRole("button", { name: /log out/i }))
    expect(await screen.findByRole("link", { name: /log in/i })).toBeInTheDocument()
    home.unmount()

    // Log back in with the passkey just registered — the "authenticate" ceremony.
    const login = render(<LoginPage />)
    await user.click(await screen.findByRole("button", { name: /log in with a passkey/i }))
    expect(await screen.findByText(/^logged in\.$/i)).toBeInTheDocument()
    login.unmount()

    // The session it created is real: it resolves on any page that reads it.
    render(<HomePage />)
    expect(await screen.findByText(new RegExp(`signed in as ${EMAIL}`, "i"))).toBeInTheDocument()
  })

  it("returns to the idle login button with no error when the ceremony is cancelled", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("fetch", createTestAuthFetch("email-password,passkey").fetch)
    const authenticator = new VirtualAuthenticator(RP_ID, ORIGIN)
    authenticator.install()
    authenticator.cancelNextCeremony()

    render(<LoginPage />)
    const passkeyButton = await screen.findByRole("button", { name: /log in with a passkey/i })
    await user.click(passkeyButton)

    // Back to the exact same idle button — no error banner, no navigation,
    // no lingering "waiting" state.
    expect(
      await screen.findByRole("button", { name: /^log in with a passkey$/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText(/^logged in\.$/i)).not.toBeInTheDocument()
  })
})
