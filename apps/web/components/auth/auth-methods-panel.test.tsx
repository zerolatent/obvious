import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { isPasskeySupported } from "../../lib/webauthn-support"

import { AuthMethodsPanel } from "./auth-methods-panel"

/** Stubs `fetch` for exactly the /api/auth-methods call this panel makes. */
function stubMethodsFetch(respond: () => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString()
      if (!url.includes("/api/auth-methods")) {
        throw new Error(`Unexpected fetch in this test: ${url}`)
      }
      return respond()
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Several tests below push OAuth callback query params onto the URL —
  // never leak that into the next test's window.location.
  window.history.replaceState(null, "", "/")
})

describe("AuthMethodsPanel", () => {
  it("renders the email/password form when the method is enabled", async () => {
    stubMethodsFetch(() => Response.json({ methods: ["email-password"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(
      await screen.findByRole("form", { name: /log in with email and password/i }),
    ).toBeInTheDocument()
  })

  it("renders no email/password form when the method is disabled", async () => {
    // jsdom has no PublicKeyCredential, so passkey is filtered by the
    // capability gate even though it's enabled — the empty state this
    // exercises is the same one an unsupported browser sees for real.
    stubMethodsFetch(() => Response.json({ methods: ["passkey"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByText(/no sign-in methods are available/i)).toBeInTheDocument()
    expect(
      screen.queryByRole("form", { name: /log in with email and password/i }),
    ).not.toBeInTheDocument()
  })

  it("shows a loading state before the methods response resolves", () => {
    stubMethodsFetch(() => new Promise<Response>(() => {}))

    render(<AuthMethodsPanel mode="login" />)

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i)
  })

  it("shows an error state on fetch failure, and recovers via retry", async () => {
    let attempt = 0
    stubMethodsFetch(() => {
      attempt += 1
      if (attempt === 1) return Promise.reject(new Error("network down"))
      return Response.json({ methods: ["email-password"] })
    })
    const user = userEvent.setup()

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load sign-in options/i)

    await user.click(screen.getByRole("button", { name: /retry/i }))

    expect(
      await screen.findByRole("form", { name: /log in with email and password/i }),
    ).toBeInTheDocument()
  })

  it("also treats a non-2xx methods response as an error", async () => {
    stubMethodsFetch(() => new Response(null, { status: 500 }))

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load sign-in options/i)
  })
})

describe("AuthMethodsPanel social button visibility", () => {
  it("renders the Google button only when google is in the methods response", async () => {
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "google"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByRole("button", { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue with apple/i })).not.toBeInTheDocument()
  })

  it("renders the Apple button only when apple is in the methods response", async () => {
    stubMethodsFetch(() => Response.json({ methods: ["apple"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByRole("button", { name: /continue with apple/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument()
  })

  it("renders neither social button when neither provider is enabled", async () => {
    stubMethodsFetch(() => Response.json({ methods: ["email-password"] }))

    render(<AuthMethodsPanel mode="login" />)

    await screen.findByRole("form", { name: /log in with email and password/i })
    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /continue with apple/i })).not.toBeInTheDocument()
  })

  it("renders every enabled method side by side", async () => {
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "google", "apple"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(
      await screen.findByRole("form", { name: /log in with email and password/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue with apple/i })).toBeInTheDocument()
  })
})

describe("AuthMethodsPanel passkey visibility", () => {
  it("renders the passkey button only when it's enabled AND this browser supports WebAuthn", async () => {
    vi.stubGlobal(
      "PublicKeyCredential",
      class PublicKeyCredential {},
    )
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "passkey"] }))

    render(<AuthMethodsPanel mode="login" />)

    expect(await screen.findByRole("button", { name: /log in with a passkey/i })).toBeInTheDocument()
  })

  it("hides the passkey button when the server enables it but this browser can't run WebAuthn", async () => {
    // No PublicKeyCredential stub — isPasskeySupported() reflects the
    // sandboxed jsdom default, so this asserts against the real gate
    // rather than assuming jsdom's shape.
    expect(isPasskeySupported()).toBe(false)
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "passkey"] }))

    render(<AuthMethodsPanel mode="login" />)

    await screen.findByRole("form", { name: /log in with email and password/i })
    expect(
      screen.queryByRole("button", { name: /log in with a passkey/i }),
    ).not.toBeInTheDocument()
  })

  it("hides the passkey button when the browser supports WebAuthn but the server doesn't enable it", async () => {
    vi.stubGlobal(
      "PublicKeyCredential",
      class PublicKeyCredential {},
    )
    stubMethodsFetch(() => Response.json({ methods: ["email-password"] }))

    render(<AuthMethodsPanel mode="login" />)

    await screen.findByRole("form", { name: /log in with email and password/i })
    expect(
      screen.queryByRole("button", { name: /log in with a passkey/i }),
    ).not.toBeInTheDocument()
  })
})

describe("AuthMethodsPanel OAuth callback state", () => {
  it("returns to the login page unchanged when the user cancels provider consent", async () => {
    window.history.pushState(null, "", "/login?error=access_denied")
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "google"] }))

    render(<AuthMethodsPanel mode="login" />)

    // The page looks exactly as it would with no callback at all: the
    // methods render normally and no OAuth-related alert appears.
    expect(
      await screen.findByRole("form", { name: /log in with email and password/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.queryByText(/sign-in didn't go through/i)).not.toBeInTheDocument()

    // The query string is scrubbed so a refresh can't replay the same state.
    expect(window.location.search).toBe("")
    expect(window.location.pathname).toBe("/login")
  })

  it("shows a dismissible error banner when the provider reports a failure, form methods stay usable", async () => {
    window.history.pushState(null, "", "/login?error=server_error")
    stubMethodsFetch(() => Response.json({ methods: ["email-password", "google"] }))
    const user = userEvent.setup()

    render(<AuthMethodsPanel mode="login" />)

    const banner = await screen.findByText(/sign-in didn't go through/i)
    expect(banner).toBeInTheDocument()

    // Email/password and the social button remain fully usable alongside it.
    const emailField = screen.getByLabelText(/^email$/i)
    expect(emailField).toBeEnabled()
    expect(screen.getByRole("button", { name: /log in$/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeEnabled()

    // The query string is scrubbed regardless of outcome.
    expect(window.location.search).toBe("")

    await user.click(screen.getByRole("button", { name: /try again/i }))
    expect(screen.queryByText(/sign-in didn't go through/i)).not.toBeInTheDocument()
  })
})
