import type { AuthInstance } from "@app/auth"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OutgoingMail } from "@app/auth"

import { actionUrlFrom, createTestAuthFetch, type SentMail } from "../test/create-test-auth-fetch"
import ForgotPasswordPage from "./forgot-password/page"
import LoginPage from "./login/page"
import ResetPasswordPage from "./reset-password/page"
import VerifyEmailPage from "./verify-email/page"

const EMAIL = "reader@example.com"
const STRANGER = "nobody@example.com"
const PASSWORD = "correct-horse-battery-staple"
const NEW_PASSWORD = "a-brand-new-passphrase"

afterEach(() => {
  vi.unstubAllGlobals()
  // The panels read their state from the URL, so each test has to leave the
  // location the way it found it.
  window.history.replaceState(null, "", "/")
})

/** Creates a real account without going through the signup UI. */
async function seedAccount(auth: AuthInstance["auth"], email = EMAIL): Promise<void> {
  await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: PASSWORD, name: "Reader" }),
    }),
  )
}

/**
 * The first mail the flow sent, with an explicit guard: an empty mailbox means
 * the flow under test never dispatched, and the test should say so rather
 * than read a link out of `undefined`.
 */
function firstMail(sentMail: SentMail): OutgoingMail {
  const mail = sentMail[0]
  if (!mail) throw new Error(`Expected a mailed message, got none`)
  return mail
}

/**
 * Walks the mailed reset link the way a browser would and lands the test on
 * the page it redirects to. Deliberately not shortcut: the token this returns
 * is the one Better Auth actually minted, mailed, and then handed back through
 * its own `/reset-password/:token` redirect.
 */
async function openMailedLink(
  fetchImpl: typeof fetch,
  mailedUrl: string,
): Promise<{ pathname: string; token: string | null }> {
  const response = await fetchImpl(mailedUrl)
  expect(response.status).toBe(302)

  const location = response.headers.get("location")
  expect(location).not.toBeNull()

  const landing = new URL(location as string, "http://localhost:3000")
  window.history.replaceState(null, "", landing.toString())
  return { pathname: landing.pathname, token: landing.searchParams.get("token") }
}

describe("requesting a password reset", () => {
  it("answers a known and an unknown address with the same words, and mails only the real one", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)

    const known = render(<ForgotPasswordPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    const knownCopy = (await screen.findByRole("status")).textContent
    expect(knownCopy).toMatch(/if an account exists/i)
    known.unmount()

    const unknown = render(<ForgotPasswordPage />)
    await user.type(await screen.findByLabelText(/^email$/i), STRANGER)
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    expect((await screen.findByRole("status")).textContent).toBe(knownCopy)
    unknown.unmount()

    // The confirmation is identical; only the mailbox differs, and the user
    // triggering it cannot see that.
    expect(sentMail.map((mail) => mail.to)).toEqual([EMAIL])
  })

  it("never says whether the address was found, even when the request itself fails", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input.toString() : input.url,
        "http://localhost:3000",
      )
      if (url.pathname.endsWith("/request-password-reset")) throw new Error("network is down")
      return authFetch(input, init)
    })

    render(<ForgotPasswordPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.click(screen.getByRole("button", { name: /send reset link/i }))

    expect((await screen.findByRole("status")).textContent).toMatch(/if an account exists/i)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("completing a password reset", () => {
  it("round-trips from the mailed link to signing in with the new password", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)

    const request = render(<ForgotPasswordPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.click(screen.getByRole("button", { name: /send reset link/i }))
    await screen.findByRole("status")
    request.unmount()

    const { pathname, token } = await openMailedLink(authFetch, actionUrlFrom(firstMail(sentMail)))
    expect(pathname).toBe("/reset-password")
    expect(token).not.toBeNull()

    const reset = render(<ResetPasswordPage />)
    await user.type(await screen.findByLabelText(/^new password$/i), NEW_PASSWORD)
    await user.type(screen.getByLabelText(/confirm new password/i), NEW_PASSWORD)
    await user.click(screen.getByRole("button", { name: /change password/i }))
    expect(await screen.findByText(/your password has been changed/i)).toBeInTheDocument()
    reset.unmount()

    window.history.replaceState(null, "", "/")

    // The proof that the reset took: the old password is dead and the new one
    // opens a session.
    const staleLogin = render(<LoginPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), PASSWORD)
    await user.click(screen.getByRole("button", { name: /log in/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.")
    staleLogin.unmount()

    render(<LoginPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), NEW_PASSWORD)
    await user.click(screen.getByRole("button", { name: /log in/i }))
    expect(await screen.findByText(/^logged in\.$/i)).toBeInTheDocument()
  })

  it("rejects a token the server has already spent, and offers a fresh link", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)

    await auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: EMAIL, redirectTo: "/reset-password" }),
      }),
    )
    const { token } = await openMailedLink(authFetch, actionUrlFrom(firstMail(sentMail)))

    // Spend the token behind the UI's back — the same thing a second click on
    // an already-used link runs into.
    await auth.handler(
      new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ token, newPassword: NEW_PASSWORD }),
      }),
    )

    render(<ResetPasswordPage />)
    await user.type(await screen.findByLabelText(/^new password$/i), "yet-another-passphrase")
    await user.type(screen.getByLabelText(/confirm new password/i), "yet-another-passphrase")
    await user.click(screen.getByRole("button", { name: /change password/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i)
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument()
    // The form is gone: there is nothing useful left to submit with this token.
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
  })

  it("shows the expired-link notice for a link Better Auth already refused", async () => {
    const { fetch: authFetch } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)
    window.history.replaceState(null, "", "/reset-password?error=INVALID_TOKEN")

    render(<ResetPasswordPage />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i)
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument()
  })

  it("treats a direct visit with no token as an unusable link", async () => {
    const { fetch: authFetch } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)

    render(<ResetPasswordPage />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i)
  })

  it("hides the form entirely where email/password sign-in is turned off", async () => {
    // passkey: a credential-free provider, so the harness can boot it without
    // OAuth client secrets — the point is only that email/password is off.
    const { fetch: authFetch } = createTestAuthFetch("passkey")
    vi.stubGlobal("fetch", authFetch)
    window.history.replaceState(null, "", "/reset-password?token=irrelevant")

    render(<ResetPasswordPage />)

    expect(await screen.findByText(/doesn't use email and password sign-in/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument()
  })
})

describe("new-password validation", () => {
  it("catches a mismatched confirmation before spending the token", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password")
    const resetCalls: string[] = []
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input.toString() : input.url,
        "http://localhost:3000",
      )
      if (url.pathname === "/api/auth/reset-password") resetCalls.push(url.pathname)
      return authFetch(input, init)
    })
    await seedAccount(auth)

    await auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: EMAIL, redirectTo: "/reset-password" }),
      }),
    )
    await openMailedLink(authFetch, actionUrlFrom(firstMail(sentMail)))

    render(<ResetPasswordPage />)
    await user.type(await screen.findByLabelText(/^new password$/i), NEW_PASSWORD)
    await user.type(screen.getByLabelText(/confirm new password/i), `${NEW_PASSWORD}-typo`)
    await user.click(screen.getByRole("button", { name: /change password/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Both passwords must match.")
    // A single-use token must not be burned on a typo the form could catch.
    expect(resetCalls).toEqual([])
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
  })

  it("states the minimum length instead of submitting a password the server will refuse", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password")
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)

    await auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: EMAIL, redirectTo: "/reset-password" }),
      }),
    )
    await openMailedLink(authFetch, actionUrlFrom(firstMail(sentMail)))

    render(<ResetPasswordPage />)
    await user.type(await screen.findByLabelText(/^new password$/i), "short")
    await user.type(screen.getByLabelText(/confirm new password/i), "short")
    await user.click(screen.getByRole("button", { name: /change password/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be at least 8 characters.")
  })
})

describe("email verification", () => {
  it("verifies the address from the token in a link that points at the app", async () => {
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password", {
      requireEmailVerification: true,
    })
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)

    // Signup mailed a verification link; hand its token straight to the page,
    // which is the shape a deployment gets when its mail template links at the
    // app rather than at the API route.
    const token = new URL(actionUrlFrom(firstMail(sentMail))).searchParams.get("token")
    expect(token).not.toBeNull()
    window.history.replaceState(null, "", `/verify-email?token=${token}`)

    render(<VerifyEmailPage />)

    expect(await screen.findByText(/your email address is verified/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument()
  })

  it("reports an invalid token and offers a new link", async () => {
    const { fetch: authFetch } = createTestAuthFetch("email-password", {
      requireEmailVerification: true,
    })
    vi.stubGlobal("fetch", authFetch)
    window.history.replaceState(null, "", "/verify-email?token=not-a-real-token")

    render(<VerifyEmailPage />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i)
    expect(screen.getByRole("button", { name: /send a new link/i })).toBeInTheDocument()
  })

  it("reports the expiry the server redirected back with", async () => {
    const { fetch: authFetch } = createTestAuthFetch("email-password", {
      requireEmailVerification: true,
    })
    vi.stubGlobal("fetch", authFetch)
    window.history.replaceState(null, "", "/verify-email?verified=1&error=TOKEN_EXPIRED")

    render(<VerifyEmailPage />)

    // The success marker is still on the URL — the error has to win.
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer valid/i)
    expect(screen.queryByText(/your email address is verified/i)).not.toBeInTheDocument()
  })

  it("celebrates the redirect the server sends back on success", async () => {
    const { fetch: authFetch } = createTestAuthFetch("email-password", {
      requireEmailVerification: true,
    })
    vi.stubGlobal("fetch", authFetch)
    window.history.replaceState(null, "", "/verify-email?verified=1")

    render(<VerifyEmailPage />)

    expect(await screen.findByText(/your email address is verified/i)).toBeInTheDocument()
  })

  it("gives the same resend confirmation to a real address and a stranger", async () => {
    const user = userEvent.setup()
    const { fetch: authFetch, auth, sentMail } = createTestAuthFetch("email-password", {
      requireEmailVerification: true,
    })
    vi.stubGlobal("fetch", authFetch)
    await seedAccount(auth)
    sentMail.length = 0

    const real = render(<VerifyEmailPage />)
    await user.type(await screen.findByLabelText(/^email$/i), EMAIL)
    await user.click(screen.getByRole("button", { name: /send a new link/i }))
    const realCopy = (await screen.findByRole("status")).textContent
    expect(realCopy).toMatch(/if that address needs verifying/i)
    expect(sentMail.map((mail) => mail.to)).toEqual([EMAIL])
    real.unmount()

    const stranger = render(<VerifyEmailPage />)
    await user.type(await screen.findByLabelText(/^email$/i), STRANGER)
    await user.click(screen.getByRole("button", { name: /send a new link/i }))
    expect((await screen.findByRole("status")).textContent).toBe(realCopy)
    stranger.unmount()

    // Same words both times; the second address got no mail and no hint of it.
    expect(sentMail.map((mail) => mail.to)).toEqual([EMAIL])
  })
})
