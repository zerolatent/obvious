import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppleMethod, GoogleMethod } from "./social-method"

/** Stubs `fetch` for exactly the /sign-in/social call these buttons make. */
function stubSocialFetch(respond: () => Response | Promise<Response>) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (!url.includes("/sign-in/social")) {
      throw new Error(`Unexpected fetch in this test: ${url}`)
    }
    return { response: await respond(), init }
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (...args: Parameters<typeof fetch>) => {
      const { response } = await fetchSpy(...args)
      return response
    }),
  )
  return fetchSpy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("GoogleMethod / AppleMethod", () => {
  it("posts the provider, callback, and error callback URL when clicked", async () => {
    const fetchSpy = stubSocialFetch(() =>
      Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth", redirect: true }),
    )
    const user = userEvent.setup()

    render(<GoogleMethod mode="login" />)
    await user.click(screen.getByRole("button", { name: /continue with google/i }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0]
    if (!call) throw new Error("expected fetch to have been called")
    const [, init] = call
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/",
    })
  })

  it("shows a retryable inline error when the request fails before any redirect", async () => {
    stubSocialFetch(() => new Response(null, { status: 500 }))
    const user = userEvent.setup()

    render(<AppleMethod mode="login" />)
    const button = screen.getByRole("button", { name: /continue with apple/i })
    await user.click(button)

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't start/i)
    // The button is usable again — this is the retry path, not a dead end.
    expect(button).toBeEnabled()
  })

  it("disables the button while the request to start the flow is in flight", async () => {
    stubSocialFetch(() => new Promise<Response>(() => {}))
    const user = userEvent.setup()

    render(<GoogleMethod mode="signup" />)
    const button = screen.getByRole("button", { name: /continue with google/i })
    await user.click(button)

    expect(button).toBeDisabled()
  })
})
