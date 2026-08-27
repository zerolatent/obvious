import { authMethodsResponse, createProviderRegistry, KNOWN_PROVIDERS } from "@app/auth"
import { describe, expect, it, vi } from "vitest"

import { AUTH_METHODS_PATH, authMethodsUrl, fetchAuthMethods, parseAuthMethods } from "./methods"

/**
 * The methods contract is shared, so it is asserted against the server's own
 * producer (`authMethodsResponse` from packages/auth) rather than against a
 * hand-written fixture: a change to the registry that the mobile client cannot
 * read fails here instead of on a device.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("authMethodsUrl", () => {
  it("joins the configured base URL without doubling slashes", () => {
    expect(authMethodsUrl("https://auth.example.com")).toBe(
      `https://auth.example.com${AUTH_METHODS_PATH}`,
    )
    expect(authMethodsUrl("https://auth.example.com/")).toBe(
      `https://auth.example.com${AUTH_METHODS_PATH}`,
    )
  })
})

describe("shared /api/auth-methods contract", () => {
  it.each([
    "email-password",
    "email-password,google",
    "email-password,google,apple",
    "google,apple",
    "email-password,google,apple,passkey",
  ])("reads back exactly what a server with AUTH_PROVIDERS=%s advertises", (providers) => {
    const registry = createProviderRegistry(providers)
    const served = authMethodsResponse(registry)

    const parsed = parseAuthMethods(served)

    expect(parsed.methods).toEqual([...registry.enabled])
    expect(parsed.unsupported).toEqual([])
  })

  it("renders in the registry's canonical order regardless of response order", () => {
    const parsed = parseAuthMethods({ methods: ["passkey", "google", "email-password"] })

    expect(parsed.methods).toEqual(
      KNOWN_PROVIDERS.filter((id) => ["passkey", "google", "email-password"].includes(id)),
    )
  })

  it("reports a method a newer server offers instead of dropping it silently", () => {
    const parsed = parseAuthMethods({ methods: ["email-password", "magic-link"] })

    expect(parsed.methods).toEqual(["email-password"])
    expect(parsed.unsupported).toEqual(["magic-link"])
  })

  it("throws on a malformed body rather than rendering an empty sign-in screen", () => {
    expect(() => parseAuthMethods({})).toThrow(/no "methods" field/)
    expect(() => parseAuthMethods({ methods: "email-password" })).toThrow(/non-string method list/)
    expect(() => parseAuthMethods({ methods: [1, 2] })).toThrow(/non-string method list/)
  })
})

describe("fetchAuthMethods", () => {
  it("asks the configured server and parses the shared contract", async () => {
    const registry = createProviderRegistry("email-password,google")
    const fetchImpl = vi.fn(async () => jsonResponse(authMethodsResponse(registry)))

    const methods = await fetchAuthMethods({
      baseURL: "https://auth.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(methods).toEqual({ methods: ["email-password", "google"], unsupported: [] })
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://auth.example.com${AUTH_METHODS_PATH}`,
      expect.objectContaining({ headers: { accept: "application/json" } }),
    )
  })

  it("throws with the status when the server refuses, so the screen can offer a retry", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 503))

    await expect(
      fetchAuthMethods({
        baseURL: "https://auth.example.com",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/responded 503/)
  })
})
