import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

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
    stubMethodsFetch(() => Response.json({ methods: ["google"] }))

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
